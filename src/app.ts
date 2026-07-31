import cors from "@fastify/cors";
import Fastify from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import authPlugin from "./plugins/auth";
import { HttpError } from "./utils/http-error";
import { authRoutes } from "./modules/auth/auth.routes";
import { usersRoutes } from "./modules/users/users.routes";
import { storesRoutes } from "./modules/stores/stores.routes";
import { gameplayRoutes } from "./modules/gameplay/gameplay.routes";
import { loyaltyAdminRoutes } from "./modules/loyalty/loyalty.routes";
import { packagesRoutes } from "./modules/packages/packages.routes";
import { transactionsRoutes } from "./modules/transactions/transactions.routes";
import { machinesAdminRoutes } from "./modules/machines/machines.admin.routes";
import { dashboardAdminRoutes } from "./modules/admin/dashboard.routes";
import { settingsAdminRoutes } from "./modules/admin/settings.routes";
import { reportsAdminRoutes } from "./modules/admin/reports.routes";
import { campaignsAdminRoutes } from "./modules/campaigns/campaigns.routes";
import { productsRoutes } from "./modules/products/products.routes";
import { ordersRoutes } from "./modules/orders/orders.routes";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    reply.header("Access-Control-Allow-Origin", origin || "*");
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    reply.header("Access-Control-Max-Age", "86400");

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  app.register(authPlugin);

  app.register(authRoutes);
  app.register(usersRoutes);
  app.register(storesRoutes);
  app.register(gameplayRoutes);
  app.register(loyaltyAdminRoutes);
  app.register(packagesRoutes);
  app.register(transactionsRoutes);
  app.register(machinesAdminRoutes);
  app.register(dashboardAdminRoutes);
  app.register(settingsAdminRoutes);
  app.register(reportsAdminRoutes);
  app.register(campaignsAdminRoutes);
  app.register(productsRoutes);
  app.register(ordersRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        message: "Dados invalidos",
        issues: error.issues,
      });
    }

    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return reply.status(404).send({ message: "Registro nao encontrado" });
      }

      if (error.code === "P2002") {
        return reply.status(409).send({ message: "Ja existe um cadastro com esses dados" });
      }

      if (error.code === "P2003") {
        return reply.status(409).send({ message: "Este cadastro possui vinculos e nao pode ser excluido" });
      }
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      const message = error instanceof Error ? error.message : "Requisicao invalida";
      return reply.status(statusCode).send({ message });
    }

    app.log.error(error);
    return reply.status(500).send({ message: "Erro interno no servidor" });
  });

  return app;
}
