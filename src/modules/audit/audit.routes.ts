import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listAuditLogs } from "./audit.service";

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function auditRoutes(app: FastifyInstance) {
  app.get("/admin/audit-logs", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { limit } = auditQuerySchema.parse(request.query);
    const logs = await listAuditLogs(limit);
    return reply.status(200).send(logs);
  });
}
