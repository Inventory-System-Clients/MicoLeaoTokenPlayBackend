import type { Prisma, Transaction } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/http-error";
import { env } from "../../config/env";
import { mercadoPagoGateway } from "../../integrations/mercadopago";
import { cancelStoredPixPayment, getConfiguredPixGateway, getPaymentForStoredPixId } from "../../integrations/payments";
import { getEffectivePackage } from "../campaigns/campaigns.service";
import { getAdminSettings } from "../admin/settings.service";
import { applyLevelUpBonuses, type LevelUpResult } from "../loyalty/loyalty.service";

type TransactionClient = Prisma.TransactionClient;

/**
 * Cria a Transaction PENDING e a preference no Checkout Pro do Mercado Pago.
 * O frontend deve redirecionar o usuario para `checkoutUrl`: la ele escolhe
 * entre cartao (com parcelamento) ou Pix na propria pagina do Mercado Pago.
 */
export async function checkoutPackage(userId: string, packageId: string): Promise<Transaction> {
  const [user, creditPackage] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    getEffectivePackage(packageId),
  ]);

  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }
  const amountBrl = Number(creditPackage.amountBrl);
  const creditsAwarded = creditPackage.baseCredits + creditPackage.bonusCredits;
  const pointsAwarded = creditPackage.pointsAwarded;

  const transaction = await prisma.transaction.create({
    data: { userId, packageId, amountBrl, creditsAwarded, pointsAwarded },
  });

  const preference = await mercadoPagoGateway.createPreference({
    title: `Agarra Mais - Pacote ${creditPackage.name}`,
    amountBrl,
    externalReference: transaction.id,
    payerEmail: user.email,
    payerName: user.name,
  });

  return prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      checkoutUrl: preference.checkoutUrl,
      mpPreferenceId: preference.preferenceId,
    },
  });
}

export async function checkoutCustomCredits(userId: string, credits: number): Promise<Transaction> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  const settings = await getAdminSettings();
  const amountBrl = Number(settings.tokenValueBrl) * credits;
  const pointsAwarded = Math.floor(settings.pointsPerCredit * credits);

  const transaction = await prisma.transaction.create({
    data: { userId, amountBrl, creditsAwarded: credits, pointsAwarded },
  });

  const preference = await mercadoPagoGateway.createPreference({
    title: `Agarra Mais - ${credits} ficha${credits > 1 ? "s" : ""}`,
    amountBrl,
    externalReference: transaction.id,
    payerEmail: user.email,
    payerName: user.name,
  });

  return prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      checkoutUrl: preference.checkoutUrl,
      mpPreferenceId: preference.preferenceId,
    },
  });
}

export type PixCheckoutTransaction = Transaction & {
  pixQrCode: string;
  pixQrCodeBase64: string;
};

export async function checkoutPackagePix(userId: string, packageId: string): Promise<PixCheckoutTransaction> {
  const [user, creditPackage] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    getEffectivePackage(packageId),
  ]);

  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  const amountBrl = Number(creditPackage.amountBrl);
  const creditsAwarded = creditPackage.baseCredits + creditPackage.bonusCredits;
  const pointsAwarded = creditPackage.pointsAwarded;

  const transaction = await prisma.transaction.create({
    data: { userId, packageId, amountBrl, creditsAwarded, pointsAwarded },
  });

  const pixGateway = await getConfiguredPixGateway();
  const pix = await pixGateway.createPixPayment({
    title: `Agarra Mais - Pacote ${creditPackage.name}`,
    amountBrl,
    externalReference: transaction.id,
    payerEmail: user.email,
    payerName: user.name,
  });

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: { mpPaymentId: pix.paymentId },
  });

  return { ...updated, pixQrCode: pix.qrCode, pixQrCodeBase64: pix.qrCodeBase64 };
}

export async function checkoutCustomCreditsPix(userId: string, credits: number): Promise<PixCheckoutTransaction> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  const settings = await getAdminSettings();
  const amountBrl = Number(settings.tokenValueBrl) * credits;
  const pointsAwarded = Math.floor(settings.pointsPerCredit * credits);

  const transaction = await prisma.transaction.create({
    data: { userId, amountBrl, creditsAwarded: credits, pointsAwarded },
  });

  const pixGateway = await getConfiguredPixGateway();
  const pix = await pixGateway.createPixPayment({
    title: `Agarra Mais - ${credits} ficha${credits > 1 ? "s" : ""}`,
    amountBrl,
    externalReference: transaction.id,
    payerEmail: user.email,
    payerName: user.name,
  });

  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: { mpPaymentId: pix.paymentId },
  });

  return { ...updated, pixQrCode: pix.qrCode, pixQrCodeBase64: pix.qrCodeBase64 };
}

export type ConfirmTransactionResult = {
  transactionId: string;
  status: "APPROVED" | "FAILED";
  creditsAwarded: number;
  pointsAwarded: number;
  levelUp: LevelUpResult;
};

async function approveTransaction(
  tx: TransactionClient,
  transaction: Transaction,
  mpPaymentId?: string,
): Promise<ConfirmTransactionResult> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: transaction.userId } });
  const previousTotal = user.totalCreditsPurchased;
  const newTotal = previousTotal + transaction.creditsAwarded;

  await tx.user.update({
    where: { id: transaction.userId },
    data: {
      creditBalance: { increment: transaction.creditsAwarded },
      totalCreditsPurchased: { increment: transaction.creditsAwarded },
      pointsBalance: { increment: transaction.pointsAwarded },
    },
  });

  const levelUp = await applyLevelUpBonuses(tx, transaction.userId, previousTotal, newTotal);

  await tx.transaction.update({
    where: { id: transaction.id },
    data: { status: "APPROVED", mpPaymentId },
  });

  return {
    transactionId: transaction.id,
    status: "APPROVED",
    creditsAwarded: transaction.creditsAwarded,
    pointsAwarded: transaction.pointsAwarded,
    levelUp,
  };
}

/**
 * Confirmacao manual (admin/testes): usada em ambiente sem Mercado Pago real
 * conectado (MP_MOCK=true), ja que nesse modo nenhum webhook chega de verdade.
 */
export async function confirmTransaction(transactionId: string): Promise<ConfirmTransactionResult> {
  if (!env.MP_MOCK) {
    throw new BadRequestError("Em producao a compra so pode ser confirmada pelo Mercado Pago");
  }

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundError("Transacao nao encontrada");
    }
    if (transaction.status !== "PENDING") {
      throw new ConflictError("Transacao ja foi processada");
    }

    return approveTransaction(tx, transaction);
  });
}

export async function failTransaction(transactionId: string): Promise<ConfirmTransactionResult> {
  if (!env.MP_MOCK) {
    throw new BadRequestError("Em producao a falha da compra deve vir do Mercado Pago");
  }

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) {
    throw new NotFoundError("Transacao nao encontrada");
  }
  if (transaction.status !== "PENDING") {
    throw new BadRequestError("Transacao ja foi processada");
  }

  await prisma.transaction.update({ where: { id: transactionId }, data: { status: "FAILED" } });

  return {
    transactionId,
    status: "FAILED",
    creditsAwarded: 0,
    pointsAwarded: 0,
    levelUp: { bonusCreditsGranted: 0, pointsGranted: 0, levelsReached: [] },
  };
}

/**
 * Chamada pelo webhook do Mercado Pago (ver transactions.routes.ts). Nunca
 * confia no corpo da notificacao: sempre busca o pagamento de volta na API
 * deles antes de creditar - so o `paymentId` do webhook e usado, e so para
 * saber QUAL pagamento consultar.
 */
export async function handleMercadoPagoPaymentUpdate(paymentId: string): Promise<void> {
  const payment = await getPaymentForStoredPixId(paymentId);
  if (!payment || !payment.externalReference) return;

  const transaction = await prisma.transaction.findUnique({
    where: { id: payment.externalReference },
  });
  if (!transaction || transaction.status !== "PENDING") return;

  if (payment.status === "approved") {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.transaction.findUnique({ where: { id: transaction.id } });
      if (!locked || locked.status !== "PENDING") return;
      await approveTransaction(tx, locked, payment.id);
    });
    return;
  }

  if (payment.status === "rejected" || payment.status === "canceled") {
    await prisma.transaction.updateMany({
      where: { id: transaction.id, status: "PENDING" },
      data: { status: "FAILED", mpPaymentId: payment.id },
    });
  }
}

export async function handleMercadoPagoMerchantOrderUpdate(merchantOrderId: string): Promise<void> {
  const paymentIds = await mercadoPagoGateway.getMerchantOrderPaymentIds(merchantOrderId);
  await Promise.all(paymentIds.map((paymentId) => handleMercadoPagoPaymentUpdate(paymentId)));
}

export async function syncUserTransactionFromMercadoPago(
  userId: string,
  transactionId: string,
  paymentId?: string,
): Promise<Transaction> {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.userId !== userId) {
    throw new NotFoundError("Transacao nao encontrada");
  }

  const effectivePaymentId = paymentId || transaction.mpPaymentId || undefined;

  if (!effectivePaymentId || transaction.status !== "PENDING") {
    return transaction;
  }

  const payment = await getPaymentForStoredPixId(effectivePaymentId);
  if (!payment || payment.externalReference !== transaction.id) {
    return transaction;
  }

  if (payment.status === "approved") {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.transaction.findUnique({ where: { id: transaction.id } });
      if (!locked || locked.status !== "PENDING") return;
      await approveTransaction(tx, locked, payment.id);
    });
  }

  if (payment.status === "rejected" || payment.status === "canceled") {
    await prisma.transaction.updateMany({
      where: { id: transaction.id, status: "PENDING" },
      data: { status: "FAILED", mpPaymentId: payment.id },
    });
  }

  return prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
}

export async function cancelUserTransaction(userId: string, transactionId: string): Promise<Transaction> {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.userId !== userId) {
    throw new NotFoundError("Transacao nao encontrada");
  }
  if (transaction.status !== "PENDING") {
    return transaction;
  }

  if (transaction.mpPaymentId) {
    await cancelStoredPixPayment(transaction.mpPaymentId);
  }

  return prisma.transaction.update({
    where: { id: transaction.id },
    data: { status: "FAILED" },
  });
}

export async function listUserTransactions(userId: string) {
  return prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAdminTransactions() {
  return prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      package: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function getUserTransaction(userId: string, transactionId: string) {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.userId !== userId) {
    throw new NotFoundError("Transacao nao encontrada");
  }
  if (transaction.status === "PENDING" && transaction.mpPaymentId) {
    return syncUserTransactionFromMercadoPago(userId, transactionId, transaction.mpPaymentId);
  }
  return transaction;
}
