import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { compactPayGateway } from "../../integrations/compactpay";
import { ConflictError } from "../../utils/http-error";

export async function listAllMachines() {
  return prisma.machine.findMany({ orderBy: { name: "asc" }, include: { store: true } });
}

export async function applyCompactPayOnlineStatus<
  T extends { telemetryId: string; status: "AVAILABLE" | "BUSY" | "MAINTENANCE" },
>(machines: T[]): Promise<T[]> {
  if (machines.length === 0) return machines;

  try {
    const compactPayMachines = await compactPayGateway.listMachines();
    const onlineByTelemetryId = new Map(
      compactPayMachines.map((machine) => [machine.telemetryId, machine.online]),
    );

    return machines.map((machine) => {
      const online = onlineByTelemetryId.get(machine.telemetryId);
      if (online === undefined || machine.status === "BUSY") {
        return machine;
      }

      return {
        ...machine,
        status: online ? "AVAILABLE" : "MAINTENANCE",
      };
    });
  } catch {
    return machines;
  }
}

export async function createMachine(input: {
  storeId: string;
  name: string;
  imageUrl?: string;
  telemetryId: string;
  costPerGame: number;
  pulsesPerCredit: number;
}) {
  return prisma.machine.create({ data: input });
}

export async function updateMachine(
  id: string,
  input: Partial<{
    name: string;
    imageUrl: string;
    costPerGame: number;
    pulsesPerCredit: number;
    status: "AVAILABLE" | "BUSY" | "MAINTENANCE";
  }>,
) {
  return prisma.machine.update({ where: { id }, data: input });
}

export async function deleteMachine(id: string) {
  try {
    await prisma.machine.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ConflictError("Esta maquina possui historico de jogadas. Coloque em manutencao em vez de excluir.");
    }
    throw error;
  }
}

/** Lista as maquinas reais cadastradas na CompactPay, para popular o dropdown de telemetryId no admin. */
export async function listCompactPayMachines() {
  return compactPayGateway.listMachines();
}
