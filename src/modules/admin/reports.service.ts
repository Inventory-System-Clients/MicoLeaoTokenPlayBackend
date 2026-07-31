import { prisma } from "../../utils/prisma";

type DateRange = {
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  machineId?: string;
  transactionStatus?: "PENDING" | "APPROVED" | "FAILED";
  gameplayStatus?: "SUCCESS" | "FAILED";
};

type RankingItem = {
  id: string;
  name: string;
  subtitle?: string;
  purchases?: number;
  amountBrl?: number;
  credits?: number;
  games?: number;
};

function buildDateRange(input: DateRange) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = input.dateFrom ? new Date(`${input.dateFrom}T00:00:00`) : defaultFrom;
  const to = input.dateTo ? new Date(`${input.dateTo}T23:59:59.999`) : now;

  return { from, to };
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function pushRanking(
  map: Map<string, RankingItem>,
  key: string,
  data: Omit<RankingItem, "id">,
  increments: Partial<Pick<RankingItem, "purchases" | "amountBrl" | "credits" | "games">>,
) {
  const current = map.get(key) ?? {
    id: key,
    name: data.name,
    subtitle: data.subtitle,
    purchases: 0,
    amountBrl: 0,
    credits: 0,
    games: 0,
  };

  current.purchases = (current.purchases ?? 0) + (increments.purchases ?? 0);
  current.amountBrl = (current.amountBrl ?? 0) + (increments.amountBrl ?? 0);
  current.credits = (current.credits ?? 0) + (increments.credits ?? 0);
  current.games = (current.games ?? 0) + (increments.games ?? 0);
  map.set(key, current);
}

function topBy(items: Map<string, RankingItem>, field: keyof RankingItem, take = 8): RankingItem[] {
  return [...items.values()]
    .sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0) || a.name.localeCompare(b.name))
    .slice(0, take);
}

export async function getOperationsReport(input: DateRange) {
  const { from, to } = buildDateRange(input);

  const [transactions, gameplayLogs] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(input.transactionStatus ? { status: input.transactionStatus } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        package: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.gameplayLog.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(input.gameplayStatus ? { status: input.gameplayStatus } : {}),
        ...(input.machineId ? { machineId: input.machineId } : {}),
        ...(input.storeId ? { machine: { storeId: input.storeId } } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        machine: {
          select: {
            id: true,
            name: true,
            telemetryId: true,
            store: { select: { id: true, name: true, location: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const approvedTransactions = transactions.filter((transaction) => transaction.status === "APPROVED");
  const pendingTransactions = transactions.filter((transaction) => transaction.status === "PENDING");
  const failedTransactions = transactions.filter((transaction) => transaction.status === "FAILED");
  const successfulGameplay = gameplayLogs.filter((log) => log.status === "SUCCESS");
  const failedGameplay = gameplayLogs.filter((log) => log.status === "FAILED");

  const packageRanking = new Map<string, RankingItem>();
  const buyerRanking = new Map<string, RankingItem>();
  const playerRanking = new Map<string, RankingItem>();
  const storeRanking = new Map<string, RankingItem>();
  const machineRanking = new Map<string, RankingItem>();
  const dayMap = new Map<
    string,
    { date: string; revenueBrl: number; purchases: number; creditsSold: number; games: number; creditsUsed: number }
  >();

  function getDay(date: Date) {
    const key = dateKey(date);
    const current =
      dayMap.get(key) ?? {
        date: key,
        revenueBrl: 0,
        purchases: 0,
        creditsSold: 0,
        games: 0,
        creditsUsed: 0,
      };
    dayMap.set(key, current);
    return current;
  }

  for (const transaction of approvedTransactions) {
    const amountBrl = Number(transaction.amountBrl);
    const credits = transaction.creditsAwarded;
    const day = getDay(transaction.createdAt);
    day.revenueBrl += amountBrl;
    day.purchases += 1;
    day.creditsSold += credits;

    const packageKey = transaction.package?.id ?? "custom";
    pushRanking(
      packageRanking,
      packageKey,
      {
        name: transaction.package?.name ?? "Fichas avulsas",
        subtitle: transaction.package ? "Pacote" : "Compra avulsa",
      },
      { purchases: 1, amountBrl, credits },
    );

    pushRanking(
      buyerRanking,
      transaction.user.id,
      { name: transaction.user.name, subtitle: transaction.user.email },
      { purchases: 1, amountBrl, credits },
    );
  }

  for (const log of successfulGameplay) {
    const day = getDay(log.createdAt);
    day.games += 1;
    day.creditsUsed += log.creditsDebited;

    pushRanking(
      playerRanking,
      log.user.id,
      { name: log.user.name, subtitle: log.user.email },
      { games: 1, credits: log.creditsDebited },
    );

    pushRanking(
      storeRanking,
      log.machine.store.id,
      { name: log.machine.store.name, subtitle: log.machine.store.location },
      { games: 1, credits: log.creditsDebited },
    );

    pushRanking(
      machineRanking,
      log.machine.id,
      { name: log.machine.name, subtitle: `${log.machine.store.name} · ${log.machine.telemetryId}` },
      { games: 1, credits: log.creditsDebited },
    );
  }

  const revenueBrl = approvedTransactions.reduce((sum, transaction) => sum + Number(transaction.amountBrl), 0);
  const creditsSold = approvedTransactions.reduce((sum, transaction) => sum + transaction.creditsAwarded, 0);
  const creditsUsed = successfulGameplay.reduce((sum, log) => sum + log.creditsDebited, 0);
  const totalGames = successfulGameplay.length;
  const activeBuyers = new Set(approvedTransactions.map((transaction) => transaction.userId)).size;
  const activePlayers = new Set(successfulGameplay.map((log) => log.userId)).size;

  return {
    period: {
      dateFrom: dateKey(from),
      dateTo: dateKey(to),
    },
    summary: {
      revenueBrl,
      approvedPurchases: approvedTransactions.length,
      pendingPurchases: pendingTransactions.length,
      failedPurchases: failedTransactions.length,
      creditsSold,
      totalGames,
      failedGames: failedGameplay.length,
      creditsUsed,
      activeBuyers,
      activePlayers,
      averageTicketBrl: approvedTransactions.length ? revenueBrl / approvedTransactions.length : 0,
      averageCreditsPerGame: totalGames ? creditsUsed / totalGames : 0,
    },
    rankings: {
      packages: topBy(packageRanking, "purchases"),
      buyers: topBy(buyerRanking, "amountBrl"),
      players: topBy(playerRanking, "games"),
      stores: topBy(storeRanking, "games"),
      machines: topBy(machineRanking, "games"),
    },
    series: {
      daily: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    },
  };
}
