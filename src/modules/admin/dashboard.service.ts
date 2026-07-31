import { prisma } from "../../utils/prisma";

export type AdminDashboardSummary = {
  totalUsers: number;
  totalRevenueBrl: string;
  approvedTransactions: number;
  pendingTransactions: number;
  totalGameplay: number;
  successfulGameplay: number;
  activeStores: number;
  activeMachines: number;
  unavailableMachines: number;
  averageTicketBrl: string;
};

export type LoyaltyDistributionEntry = {
  levelName: string;
  userCount: number;
  percentage: number;
};

/** Quantos usuarios estao em cada nivel de fidelidade hoje (grafico do painel admin). */
export async function getLoyaltyDistribution(): Promise<{
  totalUsers: number;
  distribution: LoyaltyDistributionEntry[];
}> {
  const levels = await prisma.loyaltyLevel.findMany({
    where: { status: "ACTIVE" },
    orderBy: { requiredCredits: "asc" },
  });
  const totalUsers = await prisma.user.count();

  const distribution = await Promise.all(
    levels.map(async (level, index) => {
      const nextLevel = levels[index + 1];
      const userCount = await prisma.user.count({
        where: {
          totalCreditsPurchased: {
            gte: level.requiredCredits,
            ...(nextLevel ? { lt: nextLevel.requiredCredits } : {}),
          },
        },
      });

      return {
        levelName: level.levelName,
        userCount,
        percentage: totalUsers === 0 ? 0 : Math.round((userCount / totalUsers) * 10000) / 100,
      };
    }),
  );

  return { totalUsers, distribution };
}

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const [
    totalUsers,
    approvedTransactions,
    pendingTransactions,
    approvedAggregate,
    totalGameplay,
    successfulGameplay,
    activeStores,
    activeMachines,
    unavailableMachines,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.transaction.count({ where: { status: "APPROVED" } }),
    prisma.transaction.count({ where: { status: "PENDING" } }),
    prisma.transaction.aggregate({
      where: { status: "APPROVED" },
      _sum: { amountBrl: true },
    }),
    prisma.gameplayLog.count(),
    prisma.gameplayLog.count({ where: { status: "SUCCESS" } }),
    prisma.store.count({ where: { status: "ACTIVE" } }),
    prisma.machine.count({ where: { status: "AVAILABLE" } }),
    prisma.machine.count({ where: { status: { in: ["BUSY", "MAINTENANCE"] } } }),
  ]);

  const totalRevenue = Number(approvedAggregate._sum.amountBrl ?? 0);
  const averageTicket = approvedTransactions === 0 ? 0 : totalRevenue / approvedTransactions;

  return {
    totalUsers,
    totalRevenueBrl: totalRevenue.toFixed(2),
    approvedTransactions,
    pendingTransactions,
    totalGameplay,
    successfulGameplay,
    activeStores,
    activeMachines,
    unavailableMachines,
    averageTicketBrl: averageTicket.toFixed(2),
  };
}
