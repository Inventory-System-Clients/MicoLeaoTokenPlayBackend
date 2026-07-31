import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateUser, registerUser } from "./auth.service";

const registerBodySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  cpf: z.string().min(11).max(14),
  phone: z.string().min(8).max(20).optional(),
  password: z.string().min(6),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: "Voce precisa aceitar a Politica de Privacidade e os Termos de Uso" }),
  }),
  privacyVersion: z.string().min(1).default("2026-07-17"),
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = registerBodySchema.parse(request.body);
    const user = await registerUser(body);

    const token = app.jwt.sign({ sub: user.id, role: user.role });

    return reply.status(201).send({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const user = await authenticateUser(body.email, body.password);

    const token = app.jwt.sign({ sub: user.id, role: user.role });

    return reply.status(200).send({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });
}
