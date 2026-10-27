const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const DEMO_USERS = [
  ['admin@exclusive.gt', 'Admin123!', 'Administrador'],
  ['ventas@exclusive.gt', 'Ventas123!', 'Ventas'],
  ['inventario@exclusive.gt', 'Inventario123!', 'Inventario'],
  ['atencion@exclusive.gt', 'Atencion123!', 'Atención al cliente'],
  ['gerencia@exclusive.gt', 'Gerencia123!', 'Gerencia'],
  ['cliente@exclusive.gt', 'Cliente123!', 'Cliente'],
];

function layout({ title, body, wide = false }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Exclusive</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/oidc/assets/login.css">
</head>
<body class="${wide ? 'is-wide' : ''}">
${body}
<script src="/oidc/assets/login.js" defer></script>
</body>
</html>`;
}

const brandSide = () => `
<aside class="brand" aria-hidden="true">
  <a class="brand__mark" href="/">EXCLUSIVE</a>
  <div class="rail">
    <span class="rail__bar"></span>
    <figure class="hanger h1"><img src="/uploads/products/p16-c15-t.webp" alt=""></figure>
    <figure class="hanger h2"><img src="/uploads/products/p25-c14-t.webp" alt=""></figure>
    <figure class="hanger h3"><img src="/uploads/products/p9-c2-t.webp" alt=""></figure>
  </div>
  <p class="brand__copy">Moda hecha para quedarse.<br>Envíos a toda Guatemala.</p>
</aside>`;

export function loginPage({ uid, email = '', error = null, notice = null, demo = true, returnTo = '/' }) {
  const demoBlock = demo
    ? `<details class="demo">
        <summary>Usuarios de demostración</summary>
        <p class="demo__hint">Toca uno para llenar el formulario.</p>
        <ul>${DEMO_USERS.map(([u, p, r]) => `<li><button type="button" class="demo__user" data-email="${esc(u)}" data-password="${esc(p)}"><span>${esc(r)}</span><small>${esc(u)}</small></button></li>`).join('')}</ul>
      </details>`
    : '';
  return layout({
    title: 'Iniciar sesión',
    body: `
<main class="auth">
  ${brandSide()}
  <section class="panel">
    <a class="panel__mark" href="/">EXCLUSIVE</a>
    <div class="card" role="region" aria-labelledby="t">
      <h1 id="t">Inicia sesión</h1>
      <p class="lead">Usa tu correo y contraseña para continuar con tu compra o entrar al panel.</p>
      ${notice ? `<div class="alert alert--ok" role="status">${esc(notice)}</div>` : ''}
      ${error ? `<div class="alert alert--error" role="alert" id="form-error">${esc(error)}</div>` : ''}
      <form method="post" action="/oidc/interaction/${esc(uid)}/login" class="form" id="login-form" novalidate autocomplete="on">
        <label class="field">
          <span>Correo electrónico</span>
          <input type="email" name="email" id="email" value="${esc(email)}" required autocomplete="username" inputmode="email" ${error ? 'aria-describedby="form-error"' : ''} ${email ? '' : 'autofocus'}>
        </label>
        <label class="field">
          <span>Contraseña</span>
          <span class="field__pw">
            <input type="password" name="password" id="password" required autocomplete="current-password" ${email ? 'autofocus' : ''}>
            <button type="button" class="pw-toggle" aria-controls="password" aria-pressed="false">Mostrar</button>
          </span>
        </label>
        <div class="row">
          <label class="check"><input type="checkbox" name="remember" value="yes"> <span>Mantener la sesión iniciada</span></label>
          <a href="/recuperar">¿Olvidaste tu contraseña?</a>
        </div>
        <button type="submit" class="btn" id="submit-btn"><span class="btn__label">Iniciar sesión</span><span class="btn__spin" aria-hidden="true"></span></button>
      </form>
      <p class="alt">¿Aún no tienes cuenta? <a href="/registro?returnTo=${encodeURIComponent(returnTo)}">Crear una cuenta</a></p>
      ${demoBlock}
    </div>
    <p class="secure">Conexión gestionada con OpenID Connect · Código de autorización con PKCE</p>
  </section>
</main>`,
  });
}

export function messagePage({ title, message, action = { href: '/', label: 'Volver a la tienda' }, tone = 'info', autoSubmitForm = '' }) {
  return layout({
    title,
    body: `
<main class="auth auth--single">
  <section class="panel">
    <a class="panel__mark" href="/">EXCLUSIVE</a>
    <div class="card card--center">
      <div class="badge badge--${tone}" aria-hidden="true">${tone === 'error' ? '!' : tone === 'ok' ? '✓' : '…'}</div>
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(message)}</p>
      ${autoSubmitForm}
      ${action ? `<a class="btn btn--link" href="${esc(action.href)}">${esc(action.label)}</a>` : ''}
    </div>
  </section>
</main>`,
  });
}

export function logoutPage(form) {
  const withYes = form.replace('</form>', '<input type="hidden" name="logout" value="yes"/></form>');
  return messagePage({
    title: 'Cerrando sesión',
    message: 'Estamos cerrando tu sesión de forma segura…',
    action: null,
    autoSubmitForm: `<div class="logout" data-autosubmit="op.logoutForm">${withYes}<noscript><button class="btn" form="op.logoutForm" type="submit">Cerrar sesión</button></noscript></div>`,
  });
}

export const postLogoutPage = () => messagePage({ title: 'Sesión cerrada', message: 'Cerraste tu sesión correctamente.', tone: 'ok' });

export function errorPage(out) {
  const msg = {
    invalid_request: 'La solicitud de inicio de sesión no es válida o ya fue utilizada.',
    invalid_client: 'La aplicación que solicitó el acceso no está registrada.',
    access_denied: 'El acceso fue denegado.',
    login_required: 'Necesitas iniciar sesión.',
    session_not_found: 'Tu sesión de inicio expiró. Vuelve a intentarlo desde la tienda.',
  }[out?.error] || 'No pudimos completar el inicio de sesión. Vuelve a intentarlo desde la tienda.';
  return messagePage({ title: 'Algo salió mal', message: msg, tone: 'error' });
}
