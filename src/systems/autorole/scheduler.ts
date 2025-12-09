/**
 * Motivación: implementar el sistema autorole (scheduler) para automatizar ese dominio sin duplicar lógica.
 *
 * Idea/concepto: organiza orquestadores y helpers específicos que combinan servicios, repositorios y eventos.
 *
 * Alcance: resuelve flujos del sistema; no define comandos ni middleware transversales.
 */
import type { UsingClient } from "seyfert";

import {
  AutoRoleGrantsRepo,
  AutoRoleRulesRepo,
  revokeByRule,
} from "@/db/repositories";
import type { AutoRoleRule } from "@/modules/autorole/types";
import { isFeatureEnabled, Features } from "@/modules/features";

const DEFAULT_INTERVAL_MS = 60_000; //  Tiempo de espera entre barridos

let timer: NodeJS.Timeout | null = null;
let ticking = false;

export function startTimedGrantScheduler(
  client: UsingClient,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  if (timer) return;
  timer = setInterval(() => sweep(client), intervalMs);
  timer.unref?.();
}

export function stopTimedGrantScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function sweep(client: UsingClient): Promise<void> {
  if (ticking) return;
  ticking = true;

  try {
    const now = new Date();
    const due = await AutoRoleGrantsRepo.listDueTimed(now);
    if (!due.length) return;

    const ruleCache = new Map<string, AutoRoleRule>();

    for (const grant of due) {
      const enabled = await isFeatureEnabled(grant.guildId, Features.Autoroles);
      if (!enabled) {
        continue;
      }

      const key = `${grant.guildId}:${grant.ruleName}`;
      let rule = ruleCache.get(key);

      if (!rule) {
        const fetched = await AutoRoleRulesRepo.fetchOne(
          grant.guildId,
          grant.ruleName,
        );
        if (fetched) {
          rule = fetched;
        } else {
          rule = {
            guildId: grant.guildId,
            name: grant.ruleName,
            trigger: { type: "MESSAGE_REACT_ANY", args: {} },
            roleId: grant.roleId,
            durationMs: grant.expiresAt
              ? Math.max(
                grant.expiresAt.getTime() -
                grant.createdAt.getTime(),
                0,
              )
              : null,
            enabled: false,
            createdBy: null,
            createdAt: grant.createdAt,
            updatedAt: grant.updatedAt,
          };
        }
        ruleCache.set(key, rule);
      }

      await revokeByRule({
        client,
        rule,
        userId: grant.userId,
        reason: `autorole:${grant.ruleName}:expire`,
        grantType: "TIMED",
      });
    }
  } catch (error) {
    client.logger?.error?.("[autorole] timed grant sweep failed", {
      error,
    });
  } finally {
    ticking = false;
  }
}

