import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createMachine,
  deleteMachine,
  listAllMachines,
  listCompactPayMachines,
  updateMachine,
} from "./machines.service";

const machineParamsSchema = z.object({ id: z.string().uuid() });

const machineBodySchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(2),
  imageUrl: z.string().url().optional(),
  telemetryId: z.string().min(1),
  costPerGame: z.number().int().positive(),
  pulsesPerCredit: z.number().int().positive(),
});

const machineUpdateBodySchema = z.object({
  name: z.string().min(2).optional(),
  imageUrl: z.string().url().optional(),
  costPerGame: z.number().int().positive().optional(),
  pulsesPerCredit: z.number().int().positive().optional(),
  status: z.enum(["AVAILABLE", "BUSY", "MAINTENANCE"]).optional(),
});

export async function machinesAdminRoutes(app: FastifyInstance) {
  app.get("/admin/machines", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const machines = await listAllMachines();
    return reply.status(200).send(machines);
  });

  app.post("/admin/machines", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = machineBodySchema.parse(request.body);
    const machine = await createMachine(body);
    return reply.status(201).send(machine);
  });

  app.put("/admin/machines/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = machineParamsSchema.parse(request.params);
    const body = machineUpdateBodySchema.parse(request.body);
    const machine = await updateMachine(id, body);
    return reply.status(200).send(machine);
  });

  app.delete("/admin/machines/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = machineParamsSchema.parse(request.params);
    await deleteMachine(id);
    return reply.status(204).send();
  });

  // Proxy para a listagem real de maquinas da CompactPay: usado pelo admin
  // para escolher o telemetryId certo (id_hardware deles) ao cadastrar uma
  // Machine aqui, em vez de digitar as cegas.
  app.get(
    "/admin/compactpay/machines",
    { onRequest: [app.requireAdmin] },
    async (_request, reply) => {
      const machines = await listCompactPayMachines();
      return reply.status(200).send(machines);
    },
  );
}
