import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { UnauthorizedError, ForbiddenError } from "../utils/http-error";
import { prisma } from "../utils/prisma";

export type JwtPayload = {
  sub: string;
  role: "CUSTOMER" | "ADMIN";
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Token invalido ou ausente");
    }
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Usuario bloqueado ou inexistente");
    }
  });

  app.decorate("requireAdmin", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Token invalido ou ausente");
    }
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { status: true, role: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Usuario bloqueado ou inexistente");
    }
    if (user.role !== "ADMIN") {
      throw new ForbiddenError("Rota exclusiva para administradores");
    }
  });
});
