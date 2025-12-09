/**
 * Motivación: implementar el sistema autorole (antiquity) para automatizar ese dominio sin duplicar lógica.
 *
 * Idea/concepto: organiza orquestadores y helpers específicos que combinan servicios, repositorios y eventos.
 *
 * Alcance: resuelve flujos del sistema; no define comandos ni middleware transversales.
 */
import type { UsingClient } from "seyfert";
import { AutoRoleRulesRepo } from "@/db/repositories";
import { syncUserAntiquityRoles } from "./service";
import { isFeatureEnabled, Features } from "@/modules/features";

const INTERVAL = 21600000; // 6 hours

let timer: NodeJS.Timeout | null = null;

export function startAntiquityScheduler(client: UsingClient) {
  if (timer) return;
  timer = setInterval(() => runAntiquityChecks(client), INTERVAL);
  // Run once on startup after a small delay to not block boot
  setTimeout(() => runAntiquityChecks(client), 60000);
}

export function stopAntiquityScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Re-evaluates antiquity-based autorole rules. If `guildId` is provided, only
 * that guild is processed; otherwise every guild with an active rule is
 * scanned.
 */
export async function runAntiquityChecks(
  client: UsingClient,
  guildId?: string,
) {
  try {
    const guildsToCheck = new Map<string, string[]>(); // guildId -> rule names

    if (guildId) {
      const featureEnabled = await isFeatureEnabled(guildId, Features.Autoroles);
      if (!featureEnabled) return;

      const rules = await AutoRoleRulesRepo.fetchByGuild(guildId);
      const active = rules.filter(
        (rule) =>
          rule.enabled && rule.trigger.type === "ANTIQUITY_THRESHOLD",
      );
      if (!active.length) return;
      guildsToCheck.set(guildId, active.map((r) => r.name));
    } else {
      const rules = await AutoRoleRulesRepo.fetchAll();
      for (const rule of rules) {
        if (rule.trigger.type !== "ANTIQUITY_THRESHOLD" || !rule.enabled) {
          continue;
        }
        const list = guildsToCheck.get(rule.guildId) ?? [];
        list.push(rule.name);
        guildsToCheck.set(rule.guildId, list);
      }
    }

    for (const [gid] of guildsToCheck) {
      try {
        const featureEnabled = await isFeatureEnabled(gid, Features.Autoroles);
        if (!featureEnabled) continue;

        const members = await client.members.list(gid);
        for (const member of members) {
          await syncUserAntiquityRoles(client, gid, member);
        }
      } catch (error) {
        client.logger?.error?.(`[autorole] failed to check antiquity for guild ${gid}`, {
          error,
        });
      }
    }
  } catch (error) {
    client.logger?.error?.("[autorole] antiquity scheduler failed", { error });
  }
}

