/**
 * Presets de Autorole (reputación).
 *
 * Responsabilidad:
 * - Aplicar presets de reglas basadas en reputación.
 * - Encapsular la lógica de upsert + refresh del cache para mantener el resto del código simple.
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

/**
 * Crea/actualiza una regla de reputación (`REPUTATION_THRESHOLD`).
 *
 * @param options.refreshCache Por defecto `true`.
 */
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

/**
 * Aplica un preset de reglas de reputación para un guild.
 *
 * @remarks
 * Además de upsertear las reglas listadas, elimina reglas existentes de tipo `REPUTATION_THRESHOLD`
 * que no estén presentes en el preset (para que el preset sea “fuente de verdad”).
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
