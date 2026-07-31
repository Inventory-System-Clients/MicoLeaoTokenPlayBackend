import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { ConflictError } from "../../utils/http-error";

export async function listActiveStores(userId?: string) {
  const stores = await prisma.store.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: userId
      ? {
          favorites: {
            where: { userId },
            select: { id: true },
          },
        }
      : undefined,
  });

  return stores
    .map((store) => {
      const storeWithFavorites = store as typeof store & { favorites?: Array<{ id: string }> };
      const isFavorite = Boolean(storeWithFavorites.favorites?.length);
      const { favorites: _favorites, ...rest } = storeWithFavorites;
      return { ...rest, isFavorite };
    })
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name));
}

export async function listAllStores() {
  return prisma.store.findMany({ orderBy: { name: "asc" } });
}

export async function createStore(input: { name: string; location: string }) {
  return prisma.store.create({ data: input });
}

export async function updateStore(
  id: string,
  input: Partial<{ name: string; location: string; status: "ACTIVE" | "INACTIVE" }>,
) {
  return prisma.store.update({ where: { id }, data: input });
}

export async function deleteStore(id: string) {
  try {
    await prisma.store.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ConflictError("Esta loja possui maquinas vinculadas. Inative a loja ou remova as maquinas primeiro.");
    }
    throw error;
  }
}

export async function setStoreFavorite(userId: string, storeId: string, favorite: boolean) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.status !== "ACTIVE") {
    throw new ConflictError("Loja indisponivel para favorito");
  }

  if (favorite) {
    await prisma.storeFavorite.upsert({
      where: { userId_storeId: { userId, storeId } },
      update: {},
      create: { userId, storeId },
    });
  } else {
    await prisma.storeFavorite.deleteMany({ where: { userId, storeId } });
  }

  return { storeId, isFavorite: favorite };
}
