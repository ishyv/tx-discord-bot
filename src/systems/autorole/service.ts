/**
 * Motivación: implementar el sistema autorole (service) para automatizar ese dominio sin duplicar lógica.
 *
 * Idea/concepto: organiza orquestadores y helpers específicos que combinan servicios, repositorios y eventos.
 *
 * Alcance: resuelve flujos del sistema; no define comandos ni middleware transversales.
 */
import type { UsingClient } from "seyfert";

import { getGuildRules } from "@/modules/autorole/cache";
import { grantByRule, revokeByRule } from "@/db/repositories";
import { isFeatureEnabled } from "@/modules/features";

const REP_REASON = (ruleName: string) =>
  `autorole:${ruleName}:rep_threshold`;

const ANTIQUITY_REASON = (ruleName: string) =>
  `autorole:${ruleName}:antiquity_threshold`;

export async function syncUserReputationRoles(
  client: UsingClient,
  guildId: string,
  userId: string,
  rep: number,
): Promise<void> {
  const enabled = await isFeatureEnabled(guildId, "autoroles");
  if (!enabled) return;

  const cache = getGuildRules(guildId);
  if (!cache.repThresholds.length) return;

  for (const rule of cache.repThresholds) {
    if (rule.trigger.type !== "REPUTATION_THRESHOLD") continue;
    const meets = rep >= rule.trigger.args.minRep;

    if (meets) {
      await grantByRule({
        client,
        rule,
        userId,
        reason: REP_REASON(rule.name),
      });
    } else {
      await revokeByRule({
        client,
        rule,
        userId,
        reason: `${REP_REASON(rule.name)}:fall`,
        grantType: "LIVE",
      });
    }
  }
}

export async function syncUserAntiquityRoles(
  client: UsingClient,
  guildId: string,
  member: { id: string; joinedAt?: string | Date | null },
): Promise<void> {
  const enabled = await isFeatureEnabled(guildId, "autoroles");
  if (!enabled) return;

  const cache = getGuildRules(guildId);
  if (!cache.antiquityThresholds.length) return;

  const joinedAt = member.joinedAt ? new Date(member.joinedAt) : null;
  if (!joinedAt) return;

  const now = Date.now();
  const antiquity = now - joinedAt.getTime();

  for (const rule of cache.antiquityThresholds) {
    if (rule.trigger.type !== "ANTIQUITY_THRESHOLD") continue;
    const meets = antiquity >= rule.trigger.args.durationMs;

    if (meets) {
      await grantByRule({
        client,
        rule,
        userId: member.id,
        reason: ANTIQUITY_REASON(rule.name),
      });
    } else {
      await revokeByRule({
        client,
        rule,
        userId: member.id,
        reason: `${ANTIQUITY_REASON(rule.name)}:fall`,
        grantType: "LIVE",
      });
    }
  }
}

