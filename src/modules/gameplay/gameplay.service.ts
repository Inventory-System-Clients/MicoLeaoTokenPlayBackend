import { randomUUID } from "node:crypto";
import { prisma } from "../../utils/prisma";
import { BadRequestError, ConflictError, HttpError, NotFoundError } from "../../utils/http-error";
import { compactPayGateway } from "../../integrations/compactpay";
import { CompactPayRequestError } from "../../integrations/compactpay/compactpay.client";
import { applyActiveMachineOverride } from "../campaigns/campaigns.service";

export type PlayMachineResult = {
  gameplayLogId: string;
  creditsDebited: number;
  pulsesSent: number;
  remainingBalance: number;
  pulseStatus: string;
};

/**
 * Regra B: debita fichas do usuario, converte para pulsos fisicos e dispara
 * o comando na CompactPay. Se a CompactPay nao confirmar o pulso, os fichas
 * sao estornados automaticamente.
 *
 * `quantity` permite disparar varias jogadas de uma vez (seletor +/- do
 * WebApp): os fichas e pulsos sao multiplicados, mas apenas UM comando de
 * pulso e enviado a CompactPay.
 */
export async function playMachine(
  userId: string,
  machineId: string,
  quantity = 1,
): Promise<PlayMachineResult> {
  const storedMachine = await prisma.machine.findUnique({ where: { id: machineId } });
  if (!storedMachine) {
    throw new NotFoundError("Maquina nao encontrada");
  }
  const machine = await applyActiveMachineOverride(storedMachine);
  if (machine.status !== "AVAILABLE") {
    throw new ConflictError("Maquina indisponivel no momento");
  }

  const totalCredits = machine.costPerGame * quantity;
  const totalPulses = totalCredits * machine.pulsesPerCredit;
  const commandId = randomUUID();

  // Debita o saldo de forma atomica (updateMany com filtro de saldo evita corrida
  // entre duas jogadas simultaneas do mesmo usuario) e reserva a maquina.
  const debited = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.user.updateMany({
      where: { id: userId, creditBalance: { gte: totalCredits } },
      data: { creditBalance: { decrement: totalCredits } },
    });

    if (updateResult.count === 0) {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("Usuario nao encontrado");
      throw new BadRequestError("Saldo de fichas insuficiente");
    }

    const machineUpdate = await tx.machine.updateMany({
      where: { id: machineId, status: "AVAILABLE" },
      data: { status: "BUSY" },
    });

    if (machineUpdate.count === 0) {
      throw new ConflictError("Maquina indisponivel no momento");
    }

    return tx.user.findUniqueOrThrow({ where: { id: userId } });
  });

  try {
    const dispenseResult = await compactPayGateway.firePulses({
      telemetryId: machine.telemetryId,
      pulses: totalPulses,
      correlationId: commandId,
    });

    const log = await prisma.gameplayLog.create({
      data: {
        userId,
        machineId,
        creditsDebited: totalCredits,
        pulsesSent: totalPulses,
        status: dispenseResult.ok ? "SUCCESS" : "FAILED",
      },
    });

    if (!dispenseResult.ok) {
      await refundCredits(userId, totalCredits);
      throw new HttpError(502, `CompactPay nao confirmou o pulso (${dispenseResult.pulseStatus})`);
    }

    return {
      gameplayLogId: log.id,
      creditsDebited: totalCredits,
      pulsesSent: totalPulses,
      remainingBalance: debited.creditBalance,
      pulseStatus: dispenseResult.pulseStatus,
    };
  } catch (error) {
    if (!(error instanceof HttpError)) {
      // Erro de rede/infra ao falar com a CompactPay: registra falha e estorna.
      await prisma.gameplayLog.create({
        data: {
          userId,
          machineId,
          creditsDebited: totalCredits,
          pulsesSent: totalPulses,
          status: "FAILED",
        },
      });
      await refundCredits(userId, totalCredits);
    }

    if (error instanceof CompactPayRequestError) {
      if (error.upstreamStatusCode === 404) {
        throw new BadRequestError(
          "Maquina nao encontrada na CompactPay. Verifique o ID CompactPay/telemetryId cadastrado nesta maquina.",
        );
      }

      throw new HttpError(
        502,
        "Nao foi possivel comunicar com a CompactPay agora. Os fichas foram estornados.",
      );
    }

    throw error;
  } finally {
    await prisma.machine.update({ where: { id: machineId }, data: { status: "AVAILABLE" } });
  }
}

export async function listUserGameplayLogs(userId: string) {
  return prisma.gameplayLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      machine: {
        select: {
          name: true,
          store: { select: { name: true } },
        },
      },
    },
  });
}

export async function listAdminGameplayLogs(filters: {
  search?: string;
  status?: "SUCCESS" | "FAILED";
  dateFrom?: Date;
  dateTo?: Date;
  storeId?: string;
  machineId?: string;
  minCredits?: number;
  maxCredits?: number;
  limit?: number;
} = {}) {
  const search = filters.search?.trim();
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

  return prisma.gameplayLog.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.machineId ? { machineId: filters.machineId } : {}),
      ...(filters.minCredits !== undefined || filters.maxCredits !== undefined
        ? {
            creditsDebited: {
              ...(filters.minCredits !== undefined ? { gte: filters.minCredits } : {}),
              ...(filters.maxCredits !== undefined ? { lte: filters.maxCredits } : {}),
            },
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
      ...(filters.storeId ? { machine: { storeId: filters.storeId } } : {}),
      ...(search
        ? {
            OR: [
              { user: { name: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              { machine: { name: { contains: search, mode: "insensitive" } } },
              { machine: { telemetryId: { contains: search, mode: "insensitive" } } },
              { machine: { store: { name: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      machine: {
        select: {
          id: true,
          name: true,
          telemetryId: true,
          store: { select: { id: true, name: true } },
        },
      },
    },
  });
}

async function refundCredits(userId: string, credits: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { creditBalance: { increment: credits } },
  });
}
