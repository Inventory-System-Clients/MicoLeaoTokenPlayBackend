import type { Machine, Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { NotFoundError } from "../../utils/http-error";

type CampaignInput = {
  name: string;
  startsAt: Date;
  endsAt: Date;
  active?: boolean;
  notes?: string;
  packageOverrides?: Array<{
    packageId: string;
    amountBrl: number;
    baseCredits: number;
    bonusCredits: number;
    isPopular: boolean;
    active: boolean;
  }>;
  machineOverrides?: Array<{
    machineId: string;
    costPerGame: number;
    pulsesPerCredit: number;
    status?: "AVAILABLE" | "BUSY" | "MAINTENANCE";
  }>;
};

export async function listCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      packageOverrides: { include: { package: true }, orderBy: { createdAt: "desc" } },
      machineOverrides: { include: { machine: { include: { store: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listActiveCampaigns(now = new Date()) {
  return prisma.campaign.findMany({
    where: {
      active: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "desc" },
    include: {
      packageOverrides: { where: { active: true }, include: { package: true }, orderBy: { createdAt: "desc" } },
      machineOverrides: { include: { machine: { include: { store: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function createCampaign(input: CampaignInput) {
  return prisma.campaign.create({
    data: {
      name: input.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      active: input.active ?? true,
      notes: input.notes,
      packageOverrides: {
        create: input.packageOverrides ?? [],
      },
      machineOverrides: {
        create: input.machineOverrides ?? [],
      },
    },
    include: {
      packageOverrides: { include: { package: true } },
      machineOverrides: { include: { machine: { include: { store: true } } } },
    },
  });
}

export async function updateCampaign(
  id: string,
  input: Partial<Pick<CampaignInput, "name" | "startsAt" | "endsAt" | "active" | "notes">>,
) {
  return prisma.campaign.update({
    where: { id },
    data: input,
    include: {
      packageOverrides: { include: { package: true } },
      machineOverrides: { include: { machine: { include: { store: true } } } },
    },
  });
}

export async function deleteCampaign(id: string) {
  await prisma.campaign.delete({ where: { id } });
}

export async function upsertCampaignPackageOverride(
  campaignId: string,
  input: {
    packageId: string;
    amountBrl: number;
    baseCredits: number;
    bonusCredits: number;
    isPopular: boolean;
    active: boolean;
  },
) {
  await ensureCampaign(campaignId);
  return prisma.campaignPackageOverride.upsert({
    where: { campaignId_packageId: { campaignId, packageId: input.packageId } },
    update: input,
    create: { campaignId, ...input },
  });
}

export async function upsertCampaignMachineOverride(
  campaignId: string,
  input: {
    machineId: string;
    costPerGame: number;
    pulsesPerCredit: number;
    status?: "AVAILABLE" | "BUSY" | "MAINTENANCE";
  },
) {
  await ensureCampaign(campaignId);
  return prisma.campaignMachineOverride.upsert({
    where: { campaignId_machineId: { campaignId, machineId: input.machineId } },
    update: input,
    create: { campaignId, ...input },
  });
}

export async function getActiveCampaign(now = new Date()) {
  return prisma.campaign.findFirst({
    where: {
      active: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "desc" },
    include: {
      packageOverrides: true,
      machineOverrides: true,
    },
  });
}

export async function getEffectivePackage(packageId: string) {
  const creditPackage = await prisma.creditPackage.findUnique({ where: { id: packageId } });
  if (!creditPackage) {
    throw new NotFoundError("Pacote de fichas nao encontrado");
  }

  const campaign = await getActiveCampaign();
  const override = campaign?.packageOverrides.find(
    (item) => item.packageId === packageId && item.active,
  );

  // Pacote exclusivo de campanha: active:false na base, so "existe" de
  // verdade (inclusive pra compra) enquanto o override da campanha em
  // andamento estiver ativo.
  const effectiveActive = override?.active ?? creditPackage.active;
  if (!effectiveActive) {
    throw new NotFoundError("Pacote de fichas nao encontrado");
  }

  return {
    ...creditPackage,
    amountBrl: override?.amountBrl ?? creditPackage.amountBrl,
    baseCredits: override?.baseCredits ?? creditPackage.baseCredits,
    bonusCredits: override?.bonusCredits ?? creditPackage.bonusCredits,
    isPopular: override?.isPopular ?? creditPackage.isPopular,
    active: effectiveActive,
  };
}

export async function applyActivePackageOverrides<T extends { id: string; active: boolean }>(
  packages: T[],
  options: { homeOnly?: boolean } = {},
) {
  const campaign = await getActiveCampaign();
  const overrides = new Map(campaign?.packageOverrides.map((item) => [item.packageId, item]) ?? []);

  const merged = packages
    .map((creditPackage) => {
      const override = overrides.get(creditPackage.id);
      if (!override) return creditPackage;
      overrides.delete(creditPackage.id);
      return {
        ...creditPackage,
        amountBrl: override.amountBrl,
        baseCredits: override.baseCredits,
        bonusCredits: override.bonusCredits,
        isPopular: override.isPopular,
        active: override.active,
      };
    })
    .filter((creditPackage) => creditPackage.active);

  // Pacotes exclusivos de campanha: nascem com active:false (nunca aparecem
  // fora de campanha) e so entram na lista quando sobra um override ativo
  // da campanha em andamento cujo pacote base nao estava entre os `packages`
  // ja ativos recebidos (ou seja, so existe "por causa" da campanha).
  const exclusiveOverrides = [...overrides.values()].filter((item) => item.active);
  if (exclusiveOverrides.length === 0) {
    return merged as T[];
  }

  const exclusivePackages = await prisma.creditPackage.findMany({
    where: { id: { in: exclusiveOverrides.map((item) => item.packageId) } },
  });

  const exclusiveMerged = exclusivePackages
    .filter((creditPackage) => !options.homeOnly || creditPackage.showOnHome)
    .map((creditPackage) => {
      const override = exclusiveOverrides.find((item) => item.packageId === creditPackage.id)!;
      return {
        ...creditPackage,
        amountBrl: override.amountBrl,
        baseCredits: override.baseCredits,
        bonusCredits: override.bonusCredits,
        isPopular: override.isPopular,
        active: true,
      };
    });

  return [...merged, ...exclusiveMerged] as T[];
}

export async function applyActiveMachineOverride<T extends Machine>(machine: T): Promise<T> {
  const campaign = await getActiveCampaign();
  const override = campaign?.machineOverrides.find((item) => item.machineId === machine.id);
  if (!override) return machine;

  return {
    ...machine,
    costPerGame: override.costPerGame,
    pulsesPerCredit: override.pulsesPerCredit,
    status: override.status ?? machine.status,
  };
}

export async function applyActiveMachineOverrides<T extends Machine>(machines: T[]): Promise<T[]> {
  const campaign = await getActiveCampaign();
  const overrides = new Map(campaign?.machineOverrides.map((item) => [item.machineId, item]) ?? []);

  return machines.map((machine) => {
    const override = overrides.get(machine.id);
    if (!override) return machine;
    return {
      ...machine,
      costPerGame: override.costPerGame,
      pulsesPerCredit: override.pulsesPerCredit,
      status: override.status ?? machine.status,
    };
  });
}

async function ensureCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    throw new NotFoundError("Campanha nao encontrada");
  }
}

export type EffectivePackage = Prisma.PromiseReturnType<typeof getEffectivePackage>;
