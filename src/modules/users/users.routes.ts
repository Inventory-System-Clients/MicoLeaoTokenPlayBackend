import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getUserNavbarSummary } from "../loyalty/loyalty.service";
import {
  createAdminUser,
  acceptCurrentPrivacyPolicy,
  createPrivacyRequest,
  getUserProfile,
  getUserPrivacyStatus,
  getUserPrivacyData,
  grantUserCredits,
  listAdminPrivacyRequests,
  listAdminUsers,
  updateAdminUser,
  updateAdminPrivacyRequest,
  updateUserProfile,
} from "./users.service";

const userParamsSchema = z.object({ id: z.string().uuid() });

const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  cpf: z.string().min(11).max(14).optional(),
  phone: z.string().min(8).max(20).nullable().optional(),
  password: z.string().min(6).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  role: z.enum(["CUSTOMER", "ADMIN"]).optional(),
});

const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  cpf: z.string().min(11).max(14),
  phone: z.string().min(8).max(20).optional(),
  password: z.string().min(6),
  status: z.enum(["ACTIVE", "BLOCKED"]).default("ACTIVE"),
  role: z.enum(["CUSTOMER", "ADMIN"]).default("CUSTOMER"),
});

const nullableTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .optional();

const userProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
  cpf: z.string().trim().min(11).max(14).optional(),
  phone: nullableTrimmedString,
  addressZipCode: nullableTrimmedString,
  addressStreet: nullableTrimmedString,
  addressNumber: nullableTrimmedString,
  addressComplement: nullableTrimmedString,
  addressNeighborhood: nullableTrimmedString,
  addressCity: nullableTrimmedString,
  addressState: nullableTrimmedString,
});

const grantCreditsSchema = z.object({
  credits: z.number().int().positive().max(100000),
});

const privacyRequestSchema = z.object({
  type: z.enum(["ACCESS", "CORRECTION", "DELETION", "CONSENT_REVOCATION", "OTHER"]),
  message: z.string().min(10).max(2000),
});

const privacyRequestParamsSchema = z.object({ id: z.string().uuid() });

const privacyRequestUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "COMPLETED", "REJECTED"]).optional(),
  response: z.string().max(4000).nullable().optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const summary = await getUserNavbarSummary(request.user.sub);
    return reply.status(200).send(summary);
  });

  app.get("/users/me/profile", { onRequest: [app.authenticate] }, async (request, reply) => {
    const profile = await getUserProfile(request.user.sub);
    return reply.status(200).send(profile);
  });

  app.put("/users/me/profile", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = userProfileUpdateSchema.parse(request.body);
    const profile = await updateUserProfile(request.user.sub, body);
    return reply.status(200).send(profile);
  });

  app.get("/users/me/privacy", { onRequest: [app.authenticate] }, async (request, reply) => {
    const data = await getUserPrivacyData(request.user.sub);
    return reply.status(200).send(data);
  });

  app.get("/users/me/privacy-status", { onRequest: [app.authenticate] }, async (request, reply) => {
    const data = await getUserPrivacyStatus(request.user.sub);
    return reply.status(200).send(data);
  });

  app.post("/users/me/privacy-acceptance", { onRequest: [app.authenticate] }, async (request, reply) => {
    const data = await acceptCurrentPrivacyPolicy(request.user.sub);
    return reply.status(200).send(data);
  });

  app.post("/users/me/privacy-requests", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = privacyRequestSchema.parse(request.body);
    const privacyRequest = await createPrivacyRequest(request.user.sub, body);
    return reply.status(201).send(privacyRequest);
  });

  app.get("/admin/users", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const users = await listAdminUsers();
    return reply.status(200).send(users);
  });

  app.post("/admin/users", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = userCreateSchema.parse(request.body);
    const user = await createAdminUser(body);
    return reply.status(201).send(user);
  });

  app.put("/admin/users/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = userParamsSchema.parse(request.params);
    const body = userUpdateSchema.parse(request.body);
    const user = await updateAdminUser(request.user.sub, id, body);
    return reply.status(200).send(user);
  });

  app.post("/admin/users/:id/credits", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = userParamsSchema.parse(request.params);
    const { credits } = grantCreditsSchema.parse(request.body);
    const user = await grantUserCredits(id, credits);
    return reply.status(200).send(user);
  });

  app.get("/admin/privacy-requests", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const requests = await listAdminPrivacyRequests();
    return reply.status(200).send(requests);
  });

  app.put("/admin/privacy-requests/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = privacyRequestParamsSchema.parse(request.params);
    const body = privacyRequestUpdateSchema.parse(request.body);
    const privacyRequest = await updateAdminPrivacyRequest(id, body);
    return reply.status(200).send(privacyRequest);
  });
}
