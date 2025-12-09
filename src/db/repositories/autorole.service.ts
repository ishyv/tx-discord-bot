/**
 * Author: Repositories team
 * Purpose: Implements autorole business flows (grant, revoke, purge) on top of repos and Discord role operations.
 * Why exists: Separates decision-making and side-effects (DMs, role queueing) from low-level persistence and cache plumbing.
 */
import type { UsingClient } from "seyfert";

import { isLiveRule } from "@/modules/autorole/parsers";
import type {
  AutoRoleGrantReason,
  AutoRoleRule,
} from "@/modules/autorole/types";
import { enqueueRoleGrant, enqueueRoleRevoke } from "@/systems/autorole/roleOps";
import { format as formatMs } from "@/utils/ms";
import { AutoRoleGrantsRepo } from "./autorole.repo";

interface AutoroleGrantContext {
  client: UsingClient;
  rule: AutoRoleRule;
  userId: string;
  reason: string;
}

interface AutoroleRevokeContext {
  client: UsingClient;
  rule: AutoRoleRule;
  userId: string;
  reason: string;
  grantType: "LIVE" | "TIMED";
}

export async function grantByRule({
  client,
  rule,
  userId,
  reason,
}: AutoroleGrantContext): Promise<AutoRoleGrantReason> {
  const grantType = isLiveRule(rule.durationMs) ? "LIVE" : "TIMED";

  const existingGrant = await AutoRoleGrantsRepo.find(
    rule.guildId,
    userId,
    rule.roleId,
    rule.name,
    grantType,
  );
  const existingReasons = await AutoRoleGrantsRepo.countForRole(
    rule.guildId,
    userId,
    rule.roleId,
  );

  let expiresAt: Date | null = null;
  if (grantType === "TIMED") {
    const now = Date.now();
    const base = existingGrant?.expiresAt?.getTime() ?? now;
    const duration = rule.durationMs ?? 0;
    expiresAt = new Date(Math.max(base, now) + duration);
  }

  const stored = await AutoRoleGrantsRepo.upsert({
    guildId: rule.guildId,
    userId,
    roleId: rule.roleId,
    ruleName: rule.name,
    type: grantType,
    expiresAt,
  });

  const isNewReason = !existingGrant;
  const shouldGrantRole = isNewReason && existingReasons === 0;

  if (shouldGrantRole) {
    await enqueueRoleGrant(client, {
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
      reason,
    });
    await notifyRoleGranted(client, rule, userId);
  }

  client.logger?.debug?.("[autorole] grant by rule", {
    guildId: rule.guildId,
    ruleName: rule.name,
    targetUserId: userId,
    roleId: rule.roleId,
    type: grantType,
    expiresAt: stored.expiresAt?.toISOString() ?? null,
    reason,
  });

  return stored;
}

export async function revokeByRule({
  client,
  rule,
  userId,
  reason,
  grantType,
}: AutoroleRevokeContext): Promise<boolean> {
  const existing = await AutoRoleGrantsRepo.find(
    rule.guildId,
    userId,
    rule.roleId,
    rule.name,
    grantType,
  );
  if (!existing) return false;

  const removed = await AutoRoleGrantsRepo.deleteOne({
    guildId: rule.guildId,
    userId,
    roleId: rule.roleId,
    ruleName: rule.name,
    type: grantType,
  });
  if (!removed) return false;

  const remaining = await AutoRoleGrantsRepo.countForRole(
    rule.guildId,
    userId,
    rule.roleId,
  );
  if (remaining === 0) {
    await enqueueRoleRevoke(client, {
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
      reason,
    });
  }

  client.logger?.debug?.("[autorole] revoke by rule", {
    guildId: rule.guildId,
    ruleName: rule.name,
    targetUserId: userId,
    roleId: rule.roleId,
    type: grantType,
    reason,
  });

  return true;
}

export async function purgeRule(
  client: UsingClient,
  guildId: string,
  ruleName: string,
): Promise<{ removedGrants: number; roleRevocations: number }> {
  const grants = await AutoRoleGrantsRepo.listForRule(guildId, ruleName);
  if (grants.length === 0) {
    return { removedGrants: 0, roleRevocations: 0 };
  }

  const removed = await AutoRoleGrantsRepo.purgeForRule(guildId, ruleName);

  const uniquePairs = new Map<string, { userId: string; roleId: string }>();
  for (const grant of grants) {
    const key = `${grant.userId}:${grant.roleId}`;
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, {
        userId: grant.userId,
        roleId: grant.roleId,
      });
    }
  }

  let revocations = 0;
  for (const pair of uniquePairs.values()) {
    const remaining = await AutoRoleGrantsRepo.countForRole(
      guildId,
      pair.userId,
      pair.roleId,
    );
    if (remaining === 0) {
      revocations += 1;
      await enqueueRoleRevoke(client, {
        guildId,
        userId: pair.userId,
        roleId: pair.roleId,
        reason: `autorole:${ruleName}:purge`,
      });
    }
  }

  return {
    removedGrants: removed,
    roleRevocations: revocations,
  };
}

async function notifyRoleGranted(
  client: UsingClient,
  rule: AutoRoleRule,
  userId: string,
): Promise<void> {
  try {
    const roleName = (await client.roles.fetch(rule.guildId, rule.roleId)).name;

    const guild = await client.guilds.fetch(rule.guildId).catch(() => null);
    const guildName = guild?.name ?? "el servidor";
    const duration = rule.durationMs ? formatMs(rule.durationMs, true) : null;

    const lines = [
      `**[${guildName}]** Has recibido el rol \`@${roleName}\`.`,
      duration ? `Duracion: ${duration}.` : "Duracion: condicional.",
    ];

    await client.users.write(userId, {
      content: lines.join("\n"),
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    client.logger?.debug?.("[autorole] failed to DM role grant notice", {
      guildId: rule.guildId,
      userId,
      roleId: rule.roleId,
      error,
    });
  }
}
