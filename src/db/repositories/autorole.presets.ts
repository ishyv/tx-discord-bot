/**
 * Author: Repositories team
 * Purpose: Handles the reputation preset convenience APIs for autoroles.
 * Why exists: Encapsulates preset application and cache refresh so preset logic stays decoupled from generic repo operations.
 */
import type { AutoRoleRule } from "@/modules/autorole/types";
import { AutoRoleRulesRepo } from "./autorole.repo";
import { refreshGuildRules } from "./autorole.cache-service";
import { ensureGuild } from "./with_guild";

interface ReputationRuleInput {
  guildId: string;
  name: string;
  minRep: number;
  roleId: string;
  createdBy?: string | null;
}

export async function updateReputationRule(
  input: ReputationRuleInput,
  options?: { refreshCache?: boolean },
): Promise<AutoRoleRule> {
  await ensureGuild(input.guildId);
  const rule = await AutoRoleRulesRepo.upsert({
    guildId: input.guildId,
    name: input.name,
    trigger: {
      type: "REPUTATION_THRESHOLD",
      args: { minRep: input.minRep },
    },
    roleId: input.roleId,
    durationMs: null,
    enabled: true,
    createdBy: input.createdBy ?? null,
  });

  if (options?.refreshCache ?? true) {
    await refreshGuildRules(input.guildId);
  }

  return rule;
}

export async function applyReputationPreset(
  guildId: string,
  entries: Array<{ name: string; minRep: number; roleId: string }>,
  createdBy?: string | null,
): Promise<AutoRoleRule[]> {
  const applied: AutoRoleRule[] = [];
  for (const entry of entries) {
    const rule = await updateReputationRule(
      {
        guildId,
        name: entry.name,
        minRep: entry.minRep,
        roleId: entry.roleId,
        createdBy,
      },
      { refreshCache: false },
    );
    applied.push(rule);
  }

  const keep = new Set(entries.map((entry) => entry.name));
  const existing = await AutoRoleRulesRepo.fetchByGuild(guildId);
  for (const rule of existing) {
    if (rule.trigger.type === "REPUTATION_THRESHOLD" && !keep.has(rule.name)) {
      await AutoRoleRulesRepo.delete({ guildId, name: rule.name });
    }
  }

  await refreshGuildRules(guildId);
  return applied;
}
