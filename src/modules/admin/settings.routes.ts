import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAdminSettings, updateAdminSettings } from "./settings.service";

const settingsBodySchema = z.object({
  tokenBundleAmountBrl: z.number().positive().optional(),
  tokenBundleCredits: z.number().int().positive().optional(),
  tokenValueBrl: z.number().positive().optional(),
  pointsPerCredit: z.number().nonnegative().optional(),
  paymentProvider: z.enum(["MERCADO_PAGO", "SANTANDER"]).optional(),
  santanderEnvironment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
  santanderBaseUrl: z.string().url().optional(),
  santanderPixBaseUrl: z.string().url().optional(),
  santanderClientId: z.string().optional(),
  santanderClientSecret: z.string().optional(),
  santanderCertificatePem: z.string().optional(),
  santanderPrivateKeyPem: z.string().optional(),
  santanderPfxBase64: z.string().optional(),
  santanderPfxPassphrase: z.string().optional(),
  santanderPixKey: z.string().optional(),
});

const paymentProviderBodySchema = z.object({
  paymentProvider: z.enum(["MERCADO_PAGO", "SANTANDER"]),
});

export async function settingsAdminRoutes(app: FastifyInstance) {
  app.get("/settings/credits", async (_request, reply) => {
    const settings = await getAdminSettings();
    return reply.status(200).send(settings);
  });

  app.get("/admin/settings", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const settings = await getAdminSettings();
    return reply.status(200).send(settings);
  });

  app.put("/admin/settings", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = settingsBodySchema.parse(request.body);
    const settings = await updateAdminSettings(body);
    return reply.status(200).send(settings);
  });

  app.put("/admin/settings/payment-provider", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = paymentProviderBodySchema.parse(request.body);
    const settings = await updateAdminSettings(body);
    return reply.status(200).send(settings);
  });
}
