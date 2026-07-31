import { prisma } from "../../utils/prisma";
import { hashPassword, comparePassword } from "../../utils/password";
import { ConflictError, UnauthorizedError } from "../../utils/http-error";

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
