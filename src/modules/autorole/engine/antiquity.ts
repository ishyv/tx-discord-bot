import type { UsingClient } from "seyfert";
import { AutoRoleRulesStore } from "../data/store";
import { Features, isFeatureEnabled } from "@/modules/features";
import { AutoroleService } from "../service";

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
 * Re-evaluates antiquity-based autorole rules.
 */
export async function runAntiquityChecks(
  client: UsingClient,
  guildId?: string,
) {
  try {
    const guildsToCheck = new Map<string, string[]>(); // guildId -> rule names

    if (guildId) {
      const featureEnabled = await isFeatureEnabled(
        guildId,
        Features.Autoroles,
      );
      if (!featureEnabled) return;

      const rulesRes = await AutoRoleRulesStore.find({ guildId });
      if (rulesRes.isErr()) return;

      const active = rulesRes
        .unwrap()
        .filter(
          (rule) => rule.enabled && rule.trigger.type === "ANTIQUITY_THRESHOLD",
        );
      if (!active.length) return;
      guildsToCheck.set(
        guildId,
        active.map((r) => r.name),
      );
    } else {
      const allRulesRes = await AutoRoleRulesStore.find({});
      if (allRulesRes.isErr()) return;

      for (const rule of allRulesRes.unwrap()) {
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

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        let after: string | undefined;
        let pages = 0;
        while (pages < 100) {
          const members = await client.members.list(
            gid,
            { limit: 1000, after },
            true,
          );
          if (!members.length) break;

          for (const member of members) {
            await AutoroleService.syncUserAntiquityRoles(client, gid, member);
          }

          pages++;
          if (members.length < 1000) break;

          const lastId = members[members.length - 1]?.id;
          if (!lastId || lastId === after) break;
          after = lastId;

          await sleep(250);
        }
      } catch (error) {
        client.logger?.error?.(
          `[autorole] failed to check antiquity for guild ${gid}`,
          { error },
        );
      }
    }
  } catch (error) {
    client.logger?.error?.("[autorole] antiquity scheduler failed", { error });
  }
}
