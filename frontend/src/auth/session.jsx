import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';
import { api, configureApi } from '../api/client.js';
import { toast } from '../lib/alerts.js';

const origin = window.location.origin;

export const oidcConfig = {
  authority: `${origin}/oidc`,
  client_id: 'exclusive-web',
  redirect_uri: `${origin}/callback`,
  silent_redirect_uri: `${origin}/silent-renew.html`,
  post_logout_redirect_uri: `${origin}/`,
  response_type: 'code',
  scope: 'openid profile email api',
  loadUserInfo: false,
  automaticSilentRenew: true,
  monitorSession: false,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  onSigninCallback: (user) => {
    const returnTo = user?.state?.returnTo || '/';
    window.history.replaceState({}, document.title, returnTo);
    window.dispatchEvent(new PopStateEvent('popstate'));
  },
};

const SessionContext = createContext(null);

function SessionInner({ children }) {
  const auth = useAuth();
  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(false);
  const silentTried = useRef(false);
  const [silentDone, setSilentDone] = useState(false);
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => {
    configureApi({
      getToken: async () => {
        const a = authRef.current;
        if (!a.user) return null;
        if (a.user.expires_in !== undefined && a.user.expires_in < 30) {
          try {
            const u = await a.signinSilent();
            return u?.access_token || null;
          } catch {
            return a.user?.access_token || null;
          }
        }
        return a.user.access_token;
      },
      unauthorized: async (err) => {
        await authRef.current.removeUser();
        setMe(null);
        toast.error(err.message || 'Tu sesión terminó. Inicia sesión de nuevo.');
      },
    });
  }, []);

  useEffect(() => {
    if (auth.isLoading || silentTried.current) return;
    silentTried.current = true;
    if (auth.isAuthenticated || window.location.pathname === '/callback') {
      setSilentDone(true);
      return;
    }
    auth.signinSilent().catch(() => null).finally(() => setSilentDone(true));
  }, [auth.isLoading, auth.isAuthenticated]);

  const loadMe = useCallback(async () => {
    if (!authRef.current.isAuthenticated) {
      setMe(null);
      return null;
    }
    setMeLoading(true);
    try {
      const data = await api.get('/auth/me');
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) loadMe();
    else setMe(null);
  }, [auth.isAuthenticated, auth.user?.profile?.sub, loadMe]);

  useEffect(() => {
    if (auth.error && !String(auth.error.message || '').includes('login_required')) {
      console.warn('OIDC', auth.error);
    }
  }, [auth.error]);

  const value = useMemo(() => {
    const permissions = new Set(me?.permissions || []);
    return {
      ready: !auth.isLoading && silentDone && !(auth.isAuthenticated && !me && meLoading),
      isAuthenticated: auth.isAuthenticated,
      user: me,
      profile: auth.user?.profile || null,
      isStaff: !!me?.isStaff,
      can: (...perms) => perms.some((p) => permissions.has(p)),
      login: (returnTo = window.location.pathname + window.location.search, extra = {}) => auth.signinRedirect({ state: { returnTo }, ...extra }),
      register: () => auth.signinRedirect({ state: { returnTo: '/' } }),
      logout: async () => {
        const idToken = auth.user?.id_token;
        await auth.removeUser();
        setMe(null);
        window.location.assign(`/oidc/session/end?client_id=exclusive-web&post_logout_redirect_uri=${encodeURIComponent(`${origin}/`)}${idToken ? `&id_token_hint=${encodeURIComponent(idToken)}` : ''}`);
      },
      refreshMe: loadMe,
      setUnread: (n) => setMe((m) => (m ? { ...m, unreadNotifications: n } : m)),
    };
  }, [auth, me, meLoading, silentDone, loadMe]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }) {
  return (
    <AuthProvider {...oidcConfig}>
      <SessionInner>{children}</SessionInner>
    </AuthProvider>
  );
}

export const useSession = () => useContext(SessionContext);
