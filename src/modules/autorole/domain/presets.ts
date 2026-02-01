/**
 * Presets of Autorole (reputation).
 */
import type { AutoRoleRule } from "./types";
import { AutoRoleRulesStore, autoroleKeys } from "../data/store";
// refreshGuildRules will be moved to service or kept in cache.
// For now I'll import from where it will be.
import { refreshGuildRules } from "../cache";

interface ReputationRuleInput {
  guildId: string;
  name: string;
  minRep: number;
  roleId: string;
  createdBy?: string | null;
}

/**
 * Creates/updates a reputation rule.
 */
export async function updateReputationRule(
  input: ReputationRuleInput,
  options?: { refreshCache?: boolean },
): Promise<AutoRoleRule | null> {
  const ruleId = autoroleKeys.rule(input.guildId, input.name);

  const res = await AutoRoleRulesStore.patch(ruleId, {
    guildId: input.guildId,
    name: input.name,
    trigger: {
      type: "REPUTATION_THRESHOLD",
      args: { minRep: input.minRep },
    } as any,
    roleId: input.roleId,
    durationMs: null,
    enabled: true,
    createdBy: input.createdBy ?? null,
  } as any);

  if (res.isErr()) return null;

  if (options?.refreshCache ?? true) {
    await refreshGuildRules(input.guildId);
  }

  return res.unwrap();
}

/**
 * Applies a reputation preset for a guild.
 */
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
    if (rule) applied.push(rule);
  }

  const keep = new Set(entries.map((entry) => entry.name));
  const existingRes = await AutoRoleRulesStore.find({ guildId });

  if (existingRes.isOk()) {
    for (const rule of existingRes.unwrap()) {
      if (
        rule.trigger.type === "REPUTATION_THRESHOLD" &&
        !keep.has(rule.name)
      ) {
        await AutoRoleRulesStore.delete(autoroleKeys.rule(guildId, rule.name));
      }
    }
  }

  await refreshGuildRules(guildId);
  return applied;
}
