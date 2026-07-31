import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.loyaltyLevel.createMany({
    data: [
      { levelName: "Iniciante", requiredCredits: 0, bonusCreditsReward: 0, status: "ACTIVE" },
      { levelName: "Cacador de Pelucias", requiredCredits: 100, bonusCreditsReward: 10, status: "ACTIVE" },
      { levelName: "Lendario", requiredCredits: 500, bonusCreditsReward: 50, status: "ACTIVE" },
      { levelName: "Mestre dos Ursos", requiredCredits: 1000, bonusCreditsReward: 120, status: "DRAFT" },
    ],
    skipDuplicates: true,
  });

  await prisma.creditPackage.createMany({
    data: [
      { name: "Bronze", amountBrl: 10, baseCredits: 10, bonusCredits: 0, isPopular: false },
      { name: "Prata Turbo", amountBrl: 30, baseCredits: 40, bonusCredits: 10, isPopular: true },
      { name: "Ouro Mega", amountBrl: 50, baseCredits: 75, bonusCredits: 25, isPopular: false },
    ],
    skipDuplicates: true,
  });

  const store = await prisma.store.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Loja Shopping Center Norte",
      location: "Sao Paulo - SP",
    },
  });

  await prisma.machine.upsert({
    where: { telemetryId: "CP0001" },
    update: {},
    create: {
      storeId: store.id,
      name: "Garra Turbo 01",
      imageUrl: "https://example.com/machines/garra-turbo-01.jpg",
      telemetryId: "CP0001",
      costPerGame: 1,
      pulsesPerCredit: 5,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
