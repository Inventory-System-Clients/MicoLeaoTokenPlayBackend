import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCampaign,
  deleteCampaign,
  listActiveCampaigns,
  listCampaigns,
  updateCampaign,
  upsertCampaignMachineOverride,
  upsertCampaignPackageOverride,
} from "./campaigns.service";

const campaignParamsSchema = z.object({ id: z.string().uuid() });

const packageOverrideBodySchema = z.object({
  packageId: z.string().uuid(),
  amountBrl: z.number().positive(),
  baseCredits: z.number().int().positive(),
  bonusCredits: z.number().int().nonnegative().default(0),
  isPopular: z.boolean().default(false),
  active: z.boolean().default(true),
});

const machineOverrideBodySchema = z.object({
  machineId: z.string().uuid(),
  costPerGame: z.number().int().positive(),
  pulsesPerCredit: z.number().int().positive(),
  status: z.enum(["AVAILABLE", "BUSY", "MAINTENANCE"]).optional(),
});

const campaignBodySchema = z.object({
  name: z.string().min(2),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  active: z.boolean().default(true),
  notes: z.string().optional(),
  packageOverrides: z.array(packageOverrideBodySchema).optional(),
  machineOverrides: z.array(machineOverrideBodySchema).optional(),
});

const campaignUpdateSchema = campaignBodySchema
  .omit({ packageOverrides: true, machineOverrides: true })
  .partial();

export async function campaignsAdminRoutes(app: FastifyInstance) {
  app.get("/campaigns/active", async (_request, reply) => {
    const campaigns = await listActiveCampaigns();
    return reply.status(200).send(campaigns);
  });

  app.get("/admin/campaigns", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const campaigns = await listCampaigns();
    return reply.status(200).send(campaigns);
  });

  app.post("/admin/campaigns", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = campaignBodySchema.parse(request.body);
    const campaign = await createCampaign(body);
    return reply.status(201).send(campaign);
  });

  app.put("/admin/campaigns/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = campaignParamsSchema.parse(request.params);
    const body = campaignUpdateSchema.parse(request.body);
    const campaign = await updateCampaign(id, body);
    return reply.status(200).send(campaign);
  });

  app.delete("/admin/campaigns/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = campaignParamsSchema.parse(request.params);
    await deleteCampaign(id);
    return reply.status(204).send();
  });

  app.post(
    "/admin/campaigns/:id/package-overrides",
    { onRequest: [app.requireAdmin] },
    async (request, reply) => {
      const { id } = campaignParamsSchema.parse(request.params);
      const body = packageOverrideBodySchema.parse(request.body);
      const override = await upsertCampaignPackageOverride(id, body);
      return reply.status(200).send(override);
    },
  );

  app.post(
    "/admin/campaigns/:id/machine-overrides",
    { onRequest: [app.requireAdmin] },
    async (request, reply) => {
      const { id } = campaignParamsSchema.parse(request.params);
      const body = machineOverrideBodySchema.parse(request.body);
      const override = await upsertCampaignMachineOverride(id, body);
      return reply.status(200).send(override);
    },
  );
}
