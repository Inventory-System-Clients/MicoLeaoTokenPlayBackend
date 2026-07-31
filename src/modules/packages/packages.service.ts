import { prisma } from "../../utils/prisma";
import { applyActivePackageOverrides } from "../campaigns/campaigns.service";

export async function listActivePackages() {
  const packages = await prisma.creditPackage.findMany({
    where: { active: true },
    orderBy: { amountBrl: "asc" },
  });

  const effectivePackages = await applyActivePackageOverrides(packages);
  return effectivePackages.sort((a, b) => Number(a.amountBrl) - Number(b.amountBrl));
}

export async function listHomePackages() {
  const packages = await prisma.creditPackage.findMany({
    where: { active: true, showOnHome: true },
    orderBy: [{ isPopular: "desc" }, { amountBrl: "asc" }],
    take: 6,
  });

  return applyActivePackageOverrides(packages);
}

export async function listAllPackages() {
  return prisma.creditPackage.findMany({ orderBy: { amountBrl: "asc" } });
}

export async function createPackage(input: {
  name: string;
  amountBrl: number;
  baseCredits: number;
  bonusCredits: number;
  pointsAwarded: number;
  isPopular?: boolean;
  showOnHome?: boolean;
  active?: boolean;
}) {
  return prisma.creditPackage.create({ data: input });
}

export async function updatePackage(
  id: string,
  input: Partial<{
    name: string;
    amountBrl: number;
    baseCredits: number;
    bonusCredits: number;
    pointsAwarded: number;
    isPopular: boolean;
    showOnHome: boolean;
    active: boolean;
  }>,
) {
  return prisma.creditPackage.update({ where: { id }, data: input });
}

export async function deletePackage(id: string) {
  await prisma.creditPackage.delete({ where: { id } });
}
