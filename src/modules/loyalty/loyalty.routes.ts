import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deleteLoyaltyLevel, createLoyaltyLevel, listLoyaltyLevels, updateLoyaltyLevel } from "./loyalty.service";

const levelBodySchema = z.object({
  levelName: z.string().min(2),
  requiredCredits: z.number().int().nonnegative(),
  bonusCreditsReward: z.number().int().nonnegative().default(0),
  pointsAwarded: z.number().int().nonnegative().default(0),
  status: z.enum(["ACTIVE", "DRAFT"]).default("ACTIVE"),
});

const levelUpdateBodySchema = levelBodySchema.partial();
const levelParamsSchema = z.object({ id: z.string().uuid() });

export async function loyaltyAdminRoutes(app: FastifyInstance) {
  app.get("/admin/levels", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const levels = await listLoyaltyLevels();
    return reply.status(200).send(levels);
  });

  app.post("/admin/levels", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = levelBodySchema.parse(request.body);
    const level = await createLoyaltyLevel(body);
    return reply.status(201).send(level);
  });

  app.put("/admin/levels/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = levelParamsSchema.parse(request.params);
    const body = levelUpdateBodySchema.parse(request.body);
    const level = await updateLoyaltyLevel(id, body);
    return reply.status(200).send(level);
  });

  app.delete("/admin/levels/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = levelParamsSchema.parse(request.params);
    await deleteLoyaltyLevel(id);
    return reply.status(204).send();
  });
}
