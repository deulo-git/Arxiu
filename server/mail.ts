import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Amb SMTP_URL configurat envia correus de debò. Sense, els escriu al registre
 * del servidor (útil en desenvolupament per copiar l'enllaç de recuperació).
 */
export function createMailer(smtpUrl: string, from: string, log: FastifyBaseLogger): Mailer {
  if (!smtpUrl) {
    log.warn('SMTP_URL no està configurat: els correus s’escriuran al registre en lloc d’enviar-se.');
    return {
      async send(mail) {
        log.info({ to: mail.to, subject: mail.subject }, `Correu (no enviat):\n${mail.text}`);
      },
    };
  }
  const transport: Transporter = nodemailer.createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(title: string, paragraphs: string[], cta: { label: string; url: string }, footer: string) {
  const html = `<!doctype html><html lang="ca"><body style="margin:0;background:#FAF6F1;font-family:Poppins,system-ui,sans-serif;color:#2B1F16">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-size:20px;font-weight:600;margin-bottom:24px">Arxiu</div>
<div style="background:#FFFFFF;border:1px solid #E3D5C3;border-radius:16px;padding:24px">
<h1 style="margin:0 0 12px;font-size:18px">${escape(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#6E5A4A">${escape(p)}</p>`).join('')}
<a href="${escape(cta.url)}" style="display:inline-block;margin-top:8px;background:#7A4E2D;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:500">${escape(cta.label)}</a>
</div>
<p style="font-size:12px;color:#6E5A4A;margin-top:16px">${escape(footer)}</p>
</div></body></html>`;
  const text = `${title}\n\n${paragraphs.join('\n\n')}\n\n${cta.label}: ${cta.url}\n\n${footer}\n`;
  return { html, text };
}

export function resetPasswordMail(to: string, url: string): Mail {
  const subject = 'Restableix la contrasenya del teu Arxiu';
  return {
    to,
    subject,
    ...layout(
      subject,
      [
        'Algú ha demanat canviar la contrasenya. Si no has estat tu, ignora aquest correu: la contrasenya actual continua sent vàlida.',
      ],
      { label: 'Restableix la contrasenya', url },
      "L'enllaç és d'un sol ús i caduca en 30 minuts.",
    ),
  };
}

export function confirmEmailMail(to: string, url: string): Mail {
  const subject = 'Confirma el nou correu del teu Arxiu';
  return {
    to,
    subject,
    ...layout(
      subject,
      ['Has demanat fer servir aquesta adreça com a correu de recuperació del teu Arxiu.'],
      { label: 'Confirma el correu', url },
      "Si no ho has demanat tu, ignora aquest correu. L'enllaç caduca en 24 hores.",
    ),
  };
}
