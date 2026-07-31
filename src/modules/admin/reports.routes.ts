import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getOperationsReport } from "./reports.service";

const reportQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  storeId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  transactionStatus: z.enum(["PENDING", "APPROVED", "FAILED"]).optional(),
  gameplayStatus: z.enum(["SUCCESS", "FAILED"]).optional(),
});

export async function reportsAdminRoutes(app: FastifyInstance) {
  app.get("/admin/reports/operations", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const query = reportQuerySchema.parse(request.query);
    const report = await getOperationsReport(query);
    return reply.status(200).send(report);
  });
}
