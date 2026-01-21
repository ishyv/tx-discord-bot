import type { UsingClient } from "seyfert";
import { isSnowflake } from "@/utils/snowflake";

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
            if (
                !isSnowflake(operation.guildId) ||
                !isSnowflake(operation.userId) ||
                !isSnowflake(operation.roleId)
            ) {
                client.logger?.warn?.("[autorole] skip grant; invalid snowflake ids", {
                    guildId: operation.guildId,
                    userId: operation.userId,
                    roleId: operation.roleId,
                    reason: operation.reason,
                });
                return;
            }
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
            if (
                !isSnowflake(operation.guildId) ||
                !isSnowflake(operation.userId) ||
                !isSnowflake(operation.roleId)
            ) {
                client.logger?.warn?.("[autorole] skip revoke; invalid snowflake ids", {
                    guildId: operation.guildId,
                    userId: operation.userId,
                    roleId: operation.roleId,
                    reason: operation.reason,
                });
                return;
            }
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
