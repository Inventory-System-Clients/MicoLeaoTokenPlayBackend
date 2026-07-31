import { prisma } from "../../utils/prisma";

export async function listActiveProducts() {
  return prisma.product.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAllProducts() {
  return prisma.product.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createProduct(input: {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  priceCredits?: number | null;
  pricePoints?: number | null;
  priceBrl?: number | null;
  cardPriceBrl?: number | null;
  active?: boolean;
}) {
  return prisma.product.create({ data: input });
}

export async function updateProduct(
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    imageUrl: string | null;
    priceCredits: number | null;
    pricePoints: number | null;
    priceBrl: number | null;
    cardPriceBrl: number | null;
    active: boolean;
  }>,
) {
  return prisma.product.update({ where: { id }, data: input });
}

export async function deleteProduct(id: string) {
  await prisma.product.delete({ where: { id } });
}
