import type { FastifyInstance } from "fastify";
import { getAdminDashboardSummary, getLoyaltyDistribution } from "./dashboard.service";

export async function dashboardAdminRoutes(app: FastifyInstance) {
  app.get("/admin/dashboard/summary", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const summary = await getAdminDashboardSummary();
    return reply.status(200).send(summary);
  });

  app.get(
    "/admin/dashboard/loyalty-distribution",
    { onRequest: [app.requireAdmin] },
    async (_request, reply) => {
      const distribution = await getLoyaltyDistribution();
      return reply.status(200).send(distribution);
    },
  );
}
