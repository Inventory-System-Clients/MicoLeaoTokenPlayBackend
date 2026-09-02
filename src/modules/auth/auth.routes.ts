import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticateUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyTwoFactorLoginCode,
} from "./auth.service";
import type { JwtPayload } from "../../plugins/auth";
import { UnauthorizedError } from "../../utils/http-error";

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

const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const login2faBodySchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().length(6),
});

// Rotas alvo de forca bruta ganham um limite bem mais apertado que o geral
// (100/min) registrado em app.ts.
const bruteForceRateLimit = { max: 5, timeWindow: "1 minute" };

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/register",
    { config: { rateLimit: bruteForceRateLimit } },
    async (request, reply) => {
      const body = registerBodySchema.parse(request.body);
      const user = await registerUser(body);

      const token = app.jwt.sign({ sub: user.id, role: user.role });

      return reply.status(201).send({
        token,
        user: { id: user.id, name: user.name, email: user.email },
      });
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: bruteForceRateLimit } },
    async (request, reply) => {
      const body = loginBodySchema.parse(request.body);
      const user = await authenticateUser(body.email, body.password);

      if (user.twoFactorEnabled) {
        // Senha confirmada, mas falta o segundo fator: token de vida curta
        // que NAO serve pra chamar nenhuma rota autenticada normal (ver
        // checagem de pending2fa em plugins/auth.ts).
        const pendingToken = app.jwt.sign({ sub: user.id, pending2fa: true }, { expiresIn: "5m" });
        return reply.status(200).send({ twoFactorRequired: true, pendingToken });
      }

      const token = app.jwt.sign({ sub: user.id, role: user.role });

      return reply.status(200).send({
        token,
        user: { id: user.id, name: user.name, email: user.email },
      });
    },
  );

  app.post(
    "/auth/login/2fa",
    { config: { rateLimit: bruteForceRateLimit } },
    async (request, reply) => {
      const { pendingToken, code } = login2faBodySchema.parse(request.body);

      let payload: JwtPayload;
      try {
        payload = app.jwt.verify<JwtPayload>(pendingToken);
      } catch {
        throw new UnauthorizedError("Sessao de login expirada. Entre novamente.");
      }
      if (!("pending2fa" in payload)) {
        throw new UnauthorizedError("Token invalido");
      }

      const user = await verifyTwoFactorLoginCode(payload.sub, code);
      const token = app.jwt.sign({ sub: user.id, role: user.role });

      return reply.status(200).send({
        token,
        user: { id: user.id, name: user.name, email: user.email },
      });
    },
  );

  app.post(
    "/auth/forgot-password",
    { config: { rateLimit: bruteForceRateLimit } },
    async (request, reply) => {
      const { email } = forgotPasswordBodySchema.parse(request.body);
      await requestPasswordReset(email);
      // Resposta generica sempre - nao revela se o e-mail tem conta.
      return reply.status(200).send({
        message: "Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha.",
      });
    },
  );

  app.post(
    "/auth/reset-password",
    { config: { rateLimit: bruteForceRateLimit } },
    async (request, reply) => {
      const { token, password } = resetPasswordBodySchema.parse(request.body);
      await resetPassword(token, password);
      return reply.status(200).send({ message: "Senha redefinida com sucesso." });
    },
  );
}
