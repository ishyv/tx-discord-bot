import type { UsingClient } from "seyfert";

import { getGuildRules } from "@/modules/autorole/cache";
import { grantByRule, revokeByRule } from "@/modules/repo";

const REP_REASON = (ruleName: string) =>
  `autorole:${ruleName}:rep_threshold`;

export async function syncUserReputationRoles(
  client: UsingClient,
  guildId: string,
  userId: string,
  rep: number,
): Promise<void> {
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
