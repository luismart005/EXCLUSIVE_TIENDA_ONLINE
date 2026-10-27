import Provider, { errors } from 'oidc-provider';
import { prisma } from '@exclusive/db';
import { env, allowedOrigins } from '@exclusive/common';
import { PrismaOidcAdapter } from './adapter.js';
import { errorPage, logoutPage, postLogoutPage } from './views.js';

const WEB_SCOPES = 'openid profile email api';

async function loadAccount(id) {
  const userId = Number(id);
  if (!Number.isInteger(userId)) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true, emailVerified: true, status: true, sessionVersion: true, roles: { select: { role: { select: { code: true } } } } },
  });
}

export async function buildProvider({ jwks, logger }) {
  const origins = allowedOrigins();
  const devOrigins = env.isProd ? [] : [`http://localhost:${env.PORTS.web}`];
  const redirectUris = [...origins, ...devOrigins].flatMap((o) => [`${o}/callback`, `${o}/silent-renew.html`]);
  const postLogoutUris = [...origins, ...devOrigins].flatMap((o) => [`${o}/`, `${o}/sesion-cerrada`]);

  const serviceClients = Object.entries(env.SERVICE_SECRETS).map(([clientId, secret]) => ({
    client_id: clientId,
    client_secret: secret,
    grant_types: ['client_credentials'],
    response_types: [],
    redirect_uris: [],
    token_endpoint_auth_method: 'client_secret_basic',
  }));

  const configuration = {
    adapter: PrismaOidcAdapter,
    clients: [
      {
        client_id: env.WEB_CLIENT_ID,
        client_name: 'Exclusive — tienda y panel',
        application_type: 'web',
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        redirect_uris: redirectUris,
        post_logout_redirect_uris: postLogoutUris,
      },
      ...serviceClients,
    ],
    jwks,
    cookies: {
      keys: [env.COOKIE_SECRET],
      long: { signed: true, httpOnly: true, sameSite: 'lax' },
      short: { signed: true, httpOnly: true, sameSite: 'lax' },
    },
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name', 'given_name', 'family_name', 'roles'],
    },
    conformIdTokenClaims: false,
    extraParams: ['registered'],
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      clientCredentials: { enabled: true },
      introspection: { enabled: false },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: async (ctx, form) => {
          ctx.type = 'html';
          ctx.body = logoutPage(form);
        },
        postLogoutSuccessSource: async (ctx) => {
          ctx.type = 'html';
          ctx.body = postLogoutPage();
        },
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: async (ctx, client) => (client.clientId.startsWith('svc-') ? env.INTERNAL_AUDIENCE : env.API_AUDIENCE),
        useGrantedResource: async () => true,
        getResourceServerInfo: async (ctx, resourceIndicator, client) => {
          if (resourceIndicator === env.API_AUDIENCE && client.clientId === env.WEB_CLIENT_ID) {
            return { scope: 'api', audience: env.API_AUDIENCE, accessTokenTTL: env.ACCESS_TOKEN_TTL, accessTokenFormat: 'jwt', jwt: { sign: { alg: 'RS256' } } };
          }
          if (resourceIndicator === env.INTERNAL_AUDIENCE && client.clientId.startsWith('svc-')) {
            return { scope: 'internal', audience: env.INTERNAL_AUDIENCE, accessTokenTTL: 600, accessTokenFormat: 'jwt', jwt: { sign: { alg: 'RS256' } } };
          }
          throw new errors.InvalidTarget('Recurso no permitido para este cliente');
        },
      },
    },
    findAccount: async (ctx, sub) => {
      const user = await loadAccount(sub);
      if (!user || user.status !== 'ACTIVO') return undefined;
      return {
        accountId: String(user.id),
        claims: async () => ({
          sub: String(user.id),
          email: user.email,
          email_verified: user.emailVerified,
          name: `${user.firstName} ${user.lastName}`,
          given_name: user.firstName,
          family_name: user.lastName,
          roles: user.roles.map((r) => r.role.code),
        }),
      };
    },
    extraTokenClaims: async (ctx, token) => {
      if (token.kind !== 'AccessToken' || !token.accountId) return undefined;
      const user = await loadAccount(token.accountId);
      if (!user) return undefined;
      return { sv: user.sessionVersion, roles: user.roles.map((r) => r.role.code), email: user.email };
    },
    issueRefreshToken: async (ctx, client) => client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: true,
    pkce: { required: () => true },
    ttl: {
      AccessToken: env.ACCESS_TOKEN_TTL,
      AuthorizationCode: 60,
      ClientCredentials: 600,
      IdToken: 3600,
      Interaction: 3600,
      Session: env.SESSION_TTL,
      Grant: env.SESSION_TTL,
      RefreshToken: env.REFRESH_TOKEN_TTL,
    },
    interactions: {
      url: (ctx, interaction) => `/oidc/interaction/${interaction.uid}`,
    },
    clientBasedCORS: (ctx, origin) => origins.includes(origin) || devOrigins.includes(origin),
    renderError: async (ctx, out, error) => {
      logger.warn('OIDC error', { error: out?.error, description: out?.error_description, message: error?.message });
      ctx.type = 'html';
      ctx.body = errorPage(out);
    },
  };

  const provider = new Provider(env.OIDC_ISSUER, configuration);
  provider.proxy = true;

  provider.on('server_error', (ctx, err) => logger.error('OIDC server_error', { message: err.message, stack: err.stack }));
  provider.on('grant.error', (ctx, err) => logger.warn('OIDC grant.error', { message: err.message, description: err.error_description }));
  provider.on('end_session.success', (ctx) => logger.info('Sesión OIDC finalizada', { accountId: ctx.oidc.session?.accountId }));

  return provider;
}
