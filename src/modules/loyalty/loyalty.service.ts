import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { ConflictError, NotFoundError } from "../../utils/http-error";
import { calculateLoyaltyProgress, getCrossedLevels } from "./loyalty.util";

type TransactionClient = Prisma.TransactionClient;

export type UserNavbarSummary = {
  name: string;
  creditBalance: number;
  pointsBalance: number;
  currentLevelName: string | null;
  nextLevelName: string | null;
  progressPercentage: number;
};

/** Regra A: monta os dados de nivel/progresso exibidos no navbar do cliente. */
export async function getUserNavbarSummary(userId: string): Promise<UserNavbarSummary> {
  const [user, levels] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.loyaltyLevel.findMany({
      where: { status: "ACTIVE" },
      orderBy: { requiredCredits: "asc" },
    }),
  ]);

  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  const progress = calculateLoyaltyProgress(user.totalCreditsPurchased, levels);

  return {
    name: user.name,
    creditBalance: user.creditBalance,
    pointsBalance: user.pointsBalance,
    currentLevelName: progress.currentLevelName,
    nextLevelName: progress.nextLevelName,
    progressPercentage: progress.progressPercentage,
  };
}

export async function createLoyaltyLevel(input: {
  levelName: string;
  requiredCredits: number;
  bonusCreditsReward: number;
  pointsAwarded: number;
  status?: "ACTIVE" | "DRAFT";
}) {
  return prisma.loyaltyLevel.create({ data: input });
}

export async function updateLoyaltyLevel(
  id: string,
  input: Partial<{
    levelName: string;
    requiredCredits: number;
    bonusCreditsReward: number;
    pointsAwarded: number;
    status: "ACTIVE" | "DRAFT";
  }>,
) {
  try {
    return await prisma.loyaltyLevel.update({ where: { id }, data: input });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Ja existe um nivel com essa quantidade de fichas");
    }
    throw error;
  }
}

export async function deleteLoyaltyLevel(id: string) {
  await prisma.loyaltyLevel.delete({ where: { id } });
}

export async function listLoyaltyLevels() {
  return prisma.loyaltyLevel.findMany({ orderBy: { requiredCredits: "asc" } });
}

export type LevelUpResult = {
  bonusCreditsGranted: number;
  pointsGranted: number;
  levelsReached: string[];
};

/**
 * Ao registrar uma compra aprovada, verifica quais niveis o usuario cruzou
 * (comparando total antes/depois) e credita a soma dos bonus e pontos de cada um.
 * Deve ser chamada dentro da mesma transacao Prisma que aprova a compra.
 */
export async function applyLevelUpBonuses(
  tx: TransactionClient,
  userId: string,
  previousTotal: number,
  newTotal: number,
): Promise<LevelUpResult> {
  const activeLevels = await tx.loyaltyLevel.findMany({ where: { status: "ACTIVE" } });
  const crossedLevels = getCrossedLevels(previousTotal, newTotal, activeLevels);

  const bonusCreditsGranted = crossedLevels.reduce(
    (sum, level) => sum + level.bonusCreditsReward,
    0,
  );
  const pointsGranted = crossedLevels.reduce((sum, level) => sum + level.pointsAwarded, 0);

  if (bonusCreditsGranted > 0 || pointsGranted > 0) {
    await tx.user.update({
      where: { id: userId },
      data: {
        creditBalance: { increment: bonusCreditsGranted },
        pointsBalance: { increment: pointsGranted },
      },
    });
  }

  return {
    bonusCreditsGranted,
    pointsGranted,
    levelsReached: crossedLevels.map((level) => level.levelName),
  };
}
