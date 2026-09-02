import { prisma } from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { BadRequestError, NotFoundError } from "../../utils/http-error";
import { recordAuditLog } from "../audit/audit.service";

const superAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const CURRENT_PRIVACY_VERSION = "2026-07-17";

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  cpf: true,
  phone: true,
  status: true,
  role: true,
  twoFactorEnabled: true,
  creditBalance: true,
  totalCreditsPurchased: true,
  pointsBalance: true,
  createdAt: true,
};

const userProfileSelect = {
  id: true,
  name: true,
  email: true,
  cpf: true,
  phone: true,
  addressZipCode: true,
  addressStreet: true,
  addressNumber: true,
  addressComplement: true,
  addressNeighborhood: true,
  addressCity: true,
  addressState: true,
};

export async function listAdminUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: adminUserSelect,
  });

  return users.map((user) => ({
    ...user,
    protected: isSuperAdminEmail(user.email),
  }));
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userProfileSelect,
  });

  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  return user;
}

export async function updateUserProfile(
  userId: string,
  input: Partial<{
    name: string;
    email: string;
    cpf: string;
    phone: string | null;
    addressZipCode: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    addressNeighborhood: string | null;
    addressCity: string | null;
    addressState: string | null;
  }>,
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: userProfileSelect,
  });
}

function isSuperAdminEmail(email: string): boolean {
  return Boolean(superAdminEmail && email.trim().toLowerCase() === superAdminEmail);
}

export async function createAdminUser(
  requesterId: string,
  input: {
    name: string;
    email: string;
    cpf: string;
    phone?: string;
    password: string;
    role?: "CUSTOMER" | "ADMIN";
    status?: "ACTIVE" | "BLOCKED";
  },
) {
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      cpf: input.cpf,
      phone: input.phone,
      passwordHash,
      role: input.role ?? "CUSTOMER",
      status: input.status ?? "ACTIVE",
    },
    select: adminUserSelect,
  });

  recordAuditLog({
    actorId: requesterId,
    action: "user.create",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role },
  });

  return user;
}

export async function updateAdminUser(
  requesterId: string,
  userId: string,
  input: Partial<{
    name: string;
    email: string;
    cpf: string;
    phone: string | null;
    password: string;
    status: "ACTIVE" | "BLOCKED";
    role: "CUSTOMER" | "ADMIN";
    twoFactorEnabled: false;
  }>,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  if (requesterId === userId && (input.status === "BLOCKED" || input.role === "CUSTOMER")) {
    throw new BadRequestError("Voce nao pode remover seu proprio acesso admin");
  }

  if (isSuperAdminEmail(user.email) && (input.status === "BLOCKED" || input.role === "CUSTOMER")) {
    throw new BadRequestError("Este e o admin maximo e nao pode ser rebaixado ou bloqueado");
  }

  const { password, twoFactorEnabled, ...rest } = input;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      // twoFactorEnabled so chega aqui como "false" (schema so aceita esse
      // literal) - e a valvula de escape de um admin pra tirar o 2FA de
      // outro usuario que perdeu o autenticador, entao zera o secret junto.
      ...(twoFactorEnabled === false ? { twoFactorEnabled: false, twoFactorSecret: null } : {}),
    },
    select: adminUserSelect,
  });

  if (twoFactorEnabled === false) {
    recordAuditLog({
      actorId: requesterId,
      action: "user.2fa_disabled_by_admin",
      entityType: "User",
      entityId: userId,
    });
  }

  recordAuditLog({
    actorId: requesterId,
    action: password ? "user.update.password_reset_by_admin" : "user.update",
    entityType: "User",
    entityId: userId,
    metadata: { fields: Object.keys(rest) },
  });

  return updated;
}

/**
 * Direito de eliminacao (LGPD art. 18): apaga os dados que identificam a
 * pessoa mas mantem a linha e os vinculos de Transaction/GameplayLog/
 * ProductOrder, que geralmente precisam ser retidos por obrigacao legal
 * (art. 16). Um DELETE de verdade quebraria esse historico.
 */
export async function anonymizeUser(requesterId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }
  if (requesterId === userId) {
    throw new BadRequestError("Voce nao pode excluir sua propria conta por aqui");
  }
  if (isSuperAdminEmail(user.email)) {
    throw new BadRequestError("Este e o admin maximo e nao pode ser excluido");
  }

  const placeholder = `removido-${user.id}`;

  const anonymized = await prisma.user.update({
    where: { id: userId },
    data: {
      name: "Usuario removido",
      email: `${placeholder}@removido.local`,
      cpf: placeholder,
      phone: null,
      addressZipCode: null,
      addressStreet: null,
      addressNumber: null,
      addressComplement: null,
      addressNeighborhood: null,
      addressCity: null,
      addressState: null,
      twoFactorSecret: null,
      twoFactorEnabled: false,
      status: "BLOCKED",
    },
    select: adminUserSelect,
  });

  recordAuditLog({
    actorId: requesterId,
    action: "user.anonymize",
    entityType: "User",
    entityId: userId,
  });

  return anonymized;
}

export async function grantUserCredits(userId: string, credits: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  return prisma.user.update({
    where: { id: userId },
    data: { creditBalance: { increment: credits } },
    select: adminUserSelect,
  });
}

export async function getUserPrivacyData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      cpf: true,
      phone: true,
      status: true,
      role: true,
      creditBalance: true,
      totalCreditsPurchased: true,
      pointsBalance: true,
      privacyAcceptedAt: true,
      privacyVersion: true,
      createdAt: true,
      updatedAt: true,
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          amountBrl: true,
          creditsAwarded: true,
          pointsAwarded: true,
          status: true,
          createdAt: true,
          package: { select: { name: true } },
        },
      },
      gameplayLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          creditsDebited: true,
          pulsesSent: true,
          status: true,
          createdAt: true,
          machine: { select: { name: true, store: { select: { name: true } } } },
        },
      },
      productOrders: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          productName: true,
          paymentMethod: true,
          creditsSpent: true,
          pointsSpent: true,
          amountBrl: true,
          status: true,
          createdAt: true,
        },
      },
      privacyRequests: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          message: true,
          status: true,
          response: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  return {
    notice:
      "Exportacao resumida para apoio aos direitos do titular. Historicos extensos podem exigir atendimento manual.",
    user,
  };
}

export async function getUserPrivacyStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { privacyAcceptedAt: true, privacyVersion: true },
  });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  return {
    privacyAcceptedAt: user.privacyAcceptedAt,
    privacyVersion: user.privacyVersion,
    requiredVersion: CURRENT_PRIVACY_VERSION,
    acceptanceRequired: user.privacyVersion !== CURRENT_PRIVACY_VERSION || !user.privacyAcceptedAt,
  };
}

export async function acceptCurrentPrivacyPolicy(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      privacyAcceptedAt: new Date(),
      privacyVersion: CURRENT_PRIVACY_VERSION,
    },
    select: {
      privacyAcceptedAt: true,
      privacyVersion: true,
    },
  });
}

export async function createPrivacyRequest(
  userId: string,
  input: {
    type: "ACCESS" | "CORRECTION" | "DELETION" | "CONSENT_REVOCATION" | "OTHER";
    message: string;
  },
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  return prisma.privacyRequest.create({
    data: {
      userId,
      type: input.type,
      message: input.message,
    },
    select: {
      id: true,
      type: true,
      message: true,
      status: true,
      response: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function listAdminPrivacyRequests() {
  return prisma.privacyRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      message: true,
      status: true,
      response: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function updateAdminPrivacyRequest(
  requesterId: string,
  id: string,
  input: Partial<{
    status: "OPEN" | "IN_REVIEW" | "COMPLETED" | "REJECTED";
    response: string | null;
  }>,
) {
  const updated = await prisma.privacyRequest.update({
    where: { id },
    data: input,
    select: {
      id: true,
      type: true,
      message: true,
      status: true,
      response: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  recordAuditLog({
    actorId: requesterId,
    action: "privacy_request.update",
    entityType: "PrivacyRequest",
    entityId: id,
    metadata: { status: input.status },
  });

  return updated;
}
