import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../utils/prisma";
import { NotFoundError } from "../../utils/http-error";
import { applyActiveMachineOverrides } from "../campaigns/campaigns.service";
import { applyCompactPayOnlineStatus } from "../machines/machines.service";
import { createStore, deleteStore, listActiveStores, listAllStores, setStoreFavorite, updateStore } from "./stores.service";

const storeParamsSchema = z.object({ id: z.string().uuid() });

const storeBodySchema = z.object({
  name: z.string().min(2),
  location: z.string().min(2),
});

const storeUpdateBodySchema = z.object({
  name: z.string().min(2).optional(),
  location: z.string().min(2).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const storeFavoriteBodySchema = z.object({
  favorite: z.boolean(),
});

export async function storesRoutes(app: FastifyInstance) {
  app.get("/stores", async (_request, reply) => {
    const stores = await listActiveStores();
    return reply.status(200).send(stores);
  });

  app.get("/stores/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const stores = await listActiveStores(request.user.sub);
    return reply.status(200).send(stores);
  });

  app.put("/stores/:id/favorite", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = storeParamsSchema.parse(request.params);
    const { favorite } = storeFavoriteBodySchema.parse(request.body);
    const result = await setStoreFavorite(request.user.sub, id, favorite);
    return reply.status(200).send(result);
  });

  app.get("/stores/:id/machines", async (request, reply) => {
    const { id } = storeParamsSchema.parse(request.params);

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new NotFoundError("Loja nao encontrada");
    }

    const machines = await prisma.machine.findMany({
      where: { storeId: id },
      orderBy: { name: "asc" },
    });

    const effectiveMachines = await applyCompactPayOnlineStatus(
      await applyActiveMachineOverrides(machines),
    );

    return reply.status(200).send(
      effectiveMachines.map((machine) => ({
        id: machine.id,
        name: machine.name,
        imageUrl: machine.imageUrl,
        status: machine.status,
        costPerGame: machine.costPerGame,
      })),
    );
  });

  app.get("/machines/:id/context", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = storeParamsSchema.parse(request.params);

    const machine = await prisma.machine.findUnique({
      where: { id },
      include: { store: true },
    });
    if (!machine) {
      throw new NotFoundError("Maquina nao encontrada");
    }

    const [effectiveMachine] = await applyCompactPayOnlineStatus(
      await applyActiveMachineOverrides([machine]),
    );

    return reply.status(200).send({
      store: {
        id: effectiveMachine.store.id,
        name: effectiveMachine.store.name,
        location: effectiveMachine.store.location,
        status: effectiveMachine.store.status,
      },
      machine: {
        id: effectiveMachine.id,
        name: effectiveMachine.name,
        imageUrl: effectiveMachine.imageUrl,
        status: effectiveMachine.status,
        costPerGame: effectiveMachine.costPerGame,
      },
    });
  });

  app.get("/admin/stores", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const stores = await listAllStores();
    return reply.status(200).send(stores);
  });

  app.post("/admin/stores", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = storeBodySchema.parse(request.body);
    const store = await createStore(body);
    return reply.status(201).send(store);
  });

  app.put("/admin/stores/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = storeParamsSchema.parse(request.params);
    const body = storeUpdateBodySchema.parse(request.body);
    const store = await updateStore(id, body);
    return reply.status(200).send(store);
  });

  app.delete("/admin/stores/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = storeParamsSchema.parse(request.params);
    await deleteStore(id);
    return reply.status(204).send();
  });
}
