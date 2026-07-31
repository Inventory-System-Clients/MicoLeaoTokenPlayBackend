import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listAdminGameplayLogs, listUserGameplayLogs, playMachine } from "./gameplay.service";

const playBodySchema = z.object({
  machineId: z.string().uuid(),
  quantity: z.number().int().positive().max(20).default(1),
});

const adminGameplayQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["SUCCESS", "FAILED"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  storeId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  minCredits: z.coerce.number().int().nonnegative().optional(),
  maxCredits: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function gameplayRoutes(app: FastifyInstance) {
  app.get("/gameplay", { onRequest: [app.authenticate] }, async (request, reply) => {
    const logs = await listUserGameplayLogs(request.user.sub);
    return reply.status(200).send(logs);
  });

  app.get("/admin/gameplay", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const query = adminGameplayQuerySchema.parse(request.query);
    const logs = await listAdminGameplayLogs({
      ...query,
      dateTo: query.dateTo ? new Date(new Date(query.dateTo).setHours(23, 59, 59, 999)) : undefined,
    });
    return reply.status(200).send(logs);
  });

  app.post("/machines/play", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { machineId, quantity } = playBodySchema.parse(request.body);
    const userId = request.user.sub;

    const result = await playMachine(userId, machineId, quantity);

    return reply.status(200).send(result);
  });
}
