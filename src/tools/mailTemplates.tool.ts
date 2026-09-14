/**
 * Email body builders for transactional mail.
 * Keep markup email-safe (inline styles, system/Georgia stacks — no external CSS).
 */

export type BuiltEmail = {
  subject: string;
  text: string;
  html: string;
};

export function buildPasswordResetEmail(resetUrl: string): BuiltEmail {
  const subject = "Restablecer contraseña — Mercadito";
  const text = [
    "Mercadito",
    "",
    "Recibimos una solicitud para restablecer tu contraseña.",
    `Usa este enlace (válido por 15 minutos): ${resetUrl}`,
    "",
    "Si no solicitaste este cambio, puedes ignorar este correo.",
    "",
    "— El mercado local, en la palma de tu mano.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#fffefc;font-family:'DM Sans',Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fffefc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border:1px solid #E6DCCD;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background-color:#5F7745;padding:20px 28px;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">Mercadito</p>
              <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.75);font-family:'DM Sans',system-ui,sans-serif;">Mercado Boliviano</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#3A2A22;">Restablecer contraseña</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#6B574C;font-family:'DM Sans',system-ui,sans-serif;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta. El enlace es válido por <strong style="color:#3A2A22;">15 minutos</strong>.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td style="border-radius:12px;background-color:#C65A3A;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 22px;font-family:'DM Sans',system-ui,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Elegir nueva contraseña
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#968377;font-family:'DM Sans',system-ui,sans-serif;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;color:#C65A3A;font-family:'DM Sans',system-ui,sans-serif;">
                <a href="${resetUrl}" style="color:#C65A3A;">${resetUrl}</a>
              </p>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#968377;font-family:'DM Sans',system-ui,sans-serif;">
                Si no solicitaste este cambio, ignora este correo. Tu contraseña no se modificará.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #E6DCCD;">
              <p style="margin:0;font-size:12px;color:#968377;font-family:Georgia,'Times New Roman',serif;font-style:italic;">
                El mercado local, en la palma de tu mano.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
