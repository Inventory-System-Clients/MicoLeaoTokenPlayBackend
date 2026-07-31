import { prisma } from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { BadRequestError, NotFoundError } from "../../utils/http-error";

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

export async function createAdminUser(input: {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
  password: string;
  role?: "CUSTOMER" | "ADMIN";
  status?: "ACTIVE" | "BLOCKED";
}) {
  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
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

  const { password, ...rest } = input;

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...rest,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
    select: adminUserSelect,
  });
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
  id: string,
  input: Partial<{
    status: "OPEN" | "IN_REVIEW" | "COMPLETED" | "REJECTED";
    response: string | null;
  }>,
) {
  return prisma.privacyRequest.update({
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
}
