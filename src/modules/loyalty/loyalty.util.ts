export type LoyaltyLevelInput = {
  id: string;
  levelName: string;
  requiredCredits: number;
  bonusCreditsReward: number;
  pointsAwarded: number;
};

export type LoyaltyProgress = {
  currentLevelName: string | null;
  nextLevelName: string | null;
  progressPercentage: number;
};

/**
 * Regra A: dado o total de creditos comprados na vida do usuario, descobre o nivel
 * atual, o proximo nivel e a porcentagem de progresso entre os dois.
 *
 * `levels` nao precisa vir ordenado - a funcao ordena por requiredCredits.
 */
export function calculateLoyaltyProgress(
  totalCreditsPurchased: number,
  levels: LoyaltyLevelInput[],
): LoyaltyProgress {
  if (levels.length === 0) {
    return { currentLevelName: null, nextLevelName: null, progressPercentage: 0 };
  }

  const sorted = [...levels].sort((a, b) => a.requiredCredits - b.requiredCredits);

  // Nivel atual = o ultimo nivel cujo requisito o usuario ja atingiu.
  // Se o usuario ainda nao atingiu nem o primeiro nivel, ele esta "a caminho"
  // do primeiro nivel, partindo de uma base de 0 creditos.
  let currentIndex = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (totalCreditsPurchased >= sorted[i].requiredCredits) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const currentLevel = currentIndex >= 0 ? sorted[currentIndex] : null;
  const nextLevel = sorted[currentIndex + 1] ?? null;

  // Ja atingiu o maior nivel cadastrado: progresso maximo, sem proximo nivel.
  if (!nextLevel) {
    return {
      currentLevelName: currentLevel?.levelName ?? null,
      nextLevelName: null,
      progressPercentage: 100,
    };
  }

  const baseCredits = currentLevel?.requiredCredits ?? 0;
  const rangeSize = nextLevel.requiredCredits - baseCredits;
  const progressInRange = totalCreditsPurchased - baseCredits;

  const progressPercentage =
    rangeSize <= 0 ? 100 : clampPercentage((progressInRange / rangeSize) * 100);

  return {
    currentLevelName: currentLevel?.levelName ?? null,
    nextLevelName: nextLevel.levelName,
    progressPercentage,
  };
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

/**
 * Dado o total de creditos comprados antes e depois de uma compra, retorna os
 * niveis que o usuario cruzou nessa compra (para conceder o bonus de cada um).
 * Um nivel e considerado cruzado quando requiredCredits cai no intervalo
 * (previousTotal, newTotal].
 */
export function getCrossedLevels(
  previousTotal: number,
  newTotal: number,
  levels: LoyaltyLevelInput[],
): LoyaltyLevelInput[] {
  if (newTotal <= previousTotal) return [];

  return levels
    .filter((level) => level.requiredCredits > previousTotal && level.requiredCredits <= newTotal)
    .sort((a, b) => a.requiredCredits - b.requiredCredits);
}
