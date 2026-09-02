import type { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

export type AuditLogInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Fire-and-forget: uma falha ao gravar o log nao pode derrubar a operacao
 * de negocio que disparou o registro.
 */
export function recordAuditLog(input: AuditLogInput): void {
  prisma.auditLog
    .create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    })
    .catch((error) => {
      console.error("Falha ao gravar audit log", { action: input.action, entityType: input.entityType }, error);
    });
}

export async function listAuditLogs(limit = 100) {
  const take = Math.min(Math.max(limit, 1), 200);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  const actorIds = [...new Set(logs.map((log) => log.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));

  return logs.map((log) => ({
    ...log,
    actor: log.actorId ? (actorById.get(log.actorId) ?? null) : null,
  }));
}
