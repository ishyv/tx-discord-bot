/**
 * Motivación: implementar el sistema autorole (role Ops) para automatizar ese dominio sin duplicar lógica.
 *
 * Idea/concepto: organiza orquestadores y helpers específicos que combinan servicios, repositorios y eventos.
 *
 * Alcance: resuelve flujos del sistema; no define comandos ni middleware transversales.
 */
import type { UsingClient } from "seyfert";

interface RoleOperation {
  guildId: string;
  userId: string;
  roleId: string;
  reason?: string;
}

type QueueTask = () => Promise<void>;

const guildQueues = new Map<string, Promise<void>>();

function enqueue(guildId: string, task: QueueTask): Promise<void> {
  const current = guildQueues.get(guildId) ?? Promise.resolve();
  const next = current
    .catch(() => undefined)
    .then(task);

  guildQueues.set(
    guildId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );

  return next;
}

export function enqueueRoleGrant(
  client: UsingClient,
  operation: RoleOperation,
): Promise<void> {
  return enqueue(operation.guildId, async () => {
    try {
      await client.members.addRole(
        operation.guildId,
        operation.userId,
        operation.roleId,
      );
      client.logger?.debug?.("[autorole] granted role", {
        guildId: operation.guildId,
        userId: operation.userId,
        roleId: operation.roleId,
        reason: operation.reason,
      });
    } catch (error) {
      client.logger?.error?.("[autorole] failed to grant role", {
        guildId: operation.guildId,
        userId: operation.userId,
        roleId: operation.roleId,
        reason: operation.reason,
        error,
      });
    }
  });
}

export function enqueueRoleRevoke(
  client: UsingClient,
  operation: RoleOperation,
): Promise<void> {
  return enqueue(operation.guildId, async () => {
    try {
      await client.members.removeRole(
        operation.guildId,
        operation.userId,
        operation.roleId,
      );
      client.logger?.debug?.("[autorole] revoked role", {
        guildId: operation.guildId,
        userId: operation.userId,
        roleId: operation.roleId,
        reason: operation.reason,
      });
    } catch (error) {
      client.logger?.error?.("[autorole] failed to revoke role", {
        guildId: operation.guildId,
        userId: operation.userId,
        roleId: operation.roleId,
        reason: operation.reason,
        error,
      });
    }
  });
}
