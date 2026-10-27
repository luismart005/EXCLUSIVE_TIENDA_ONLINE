import { prisma } from '@exclusive/db';
import { env } from './env.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function emailLayout({ title, intro, body = '', cta, ctaUrl, footer }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F4F5F3;font-family:Arial,Helvetica,sans-serif;color:#1B2433">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E3E6E2;border-radius:12px;overflow:hidden">
    <tr><td style="padding:24px 32px;border-bottom:3px solid #0E6B58;font-size:20px;letter-spacing:4px;font-weight:700">EXCLUSIVE</td></tr>
    <tr><td style="padding:28px 32px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#3B4452">${esc(intro)}</p>
      ${body}
      ${cta ? `<p style="margin:24px 0 8px"><a href="${esc(ctaUrl)}" style="background:#0E6B58;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">${esc(cta)}</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 32px;background:#F4F5F3;font-size:12px;color:#646B73">${esc(footer || 'Mensaje del buzón de pruebas local de Exclusive. Entorno académico: no se envió por internet.')}</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendMail({ to, subject, category, title, intro, body, cta, ctaPath, text }, tx = prisma) {
  const ctaUrl = ctaPath ? `${env.PUBLIC_URL}${ctaPath}` : undefined;
  return tx.mailboxMessage.create({
    data: {
      toEmail: to,
      subject: subject.slice(0, 200),
      category,
      html: emailLayout({ title: title || subject, intro, body, cta, ctaUrl }),
      text: text || `${intro}${ctaUrl ? `\n\n${ctaUrl}` : ''}`,
    },
  });
}

export async function notifyUser(userId, { type, title, body, link }, tx = prisma) {
  return tx.notification.create({ data: { userId, type, title: title.slice(0, 160), body: body.slice(0, 500), link } });
}

export async function notifyPermission(permission, payload, tx = prisma) {
  const users = await tx.user.findMany({
    where: { status: 'ACTIVO', roles: { some: { role: { permissions: { some: { permission: { code: permission } } } } } } },
    select: { id: true },
  });
  if (!users.length) return;
  await tx.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: payload.type, title: payload.title.slice(0, 160), body: payload.body.slice(0, 500), link: payload.link })) });
}
