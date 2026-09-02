import { Resend } from "resend";
import { env } from "../../config/env";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Sem RESEND_API_KEY configurada (ambiente local/dev), so loga o conteudo em
 * vez de enviar de verdade - permite testar o fluxo inteiro (inclusive o
 * link/token) sem depender de uma conta no provedor de e-mail.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!resendClient) {
    console.log("[email mock] RESEND_API_KEY ausente - e-mail nao enviado de verdade.", {
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return;
  }

  const result = await resendClient.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (result.error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${result.error.message}`);
  }
}
