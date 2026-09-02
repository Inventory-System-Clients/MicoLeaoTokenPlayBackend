import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../../utils/prisma";
import { hashPassword, comparePassword } from "../../utils/password";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../utils/http-error";
import { env } from "../../config/env";
import { sendEmail } from "../../integrations/email";
import { recordAuditLog } from "../audit/audit.service";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

export async function registerUser(input: {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
  password: string;
  privacyAccepted: true;
  privacyVersion: string;
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { cpf: input.cpf }] },
  });
  if (existing) {
    throw new ConflictError("Ja existe um usuario com este email ou CPF");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      cpf: input.cpf,
      phone: input.phone,
      passwordHash,
      privacyAcceptedAt: new Date(),
      privacyVersion: input.privacyVersion,
    },
  });
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError("Email ou senha invalidos");
  }
  if (user.status !== "ACTIVE") {
    throw new UnauthorizedError("Usuario bloqueado");
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new UnauthorizedError("Email ou senha invalidos");
  }

  return user;
}

/**
 * Sempre "funciona" do ponto de vista do cliente (a rota chamadora responde
 * generico) mesmo se o e-mail nao existir ou o envio falhar - evita revelar
 * quais e-mails tem conta.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") {
    return;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const resetUrl = `${env.APP_BASE_URL}/redefinir-senha?token=${rawToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: "Redefinir sua senha - Mico Leão",
      html: `
        <p>Recebemos um pedido para redefinir a senha da sua conta.</p>
        <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
        <p>Esse link expira em 1 hora. Se voce nao pediu isso, pode ignorar este e-mail.</p>
      `,
    });
  } catch (error) {
    console.error("Falha ao enviar e-mail de reset de senha", error);
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new BadRequestError("Link invalido ou expirado. Peca um novo link.");
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    // Marca esse token e qualquer outro pendente do mesmo usuario como usado
    // - um link antigo esquecido aberto nao pode mais funcionar.
    prisma.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  recordAuditLog({
    actorId: resetToken.userId,
    action: "auth.password_reset_completed",
    entityType: "User",
    entityId: resetToken.userId,
  });
}
