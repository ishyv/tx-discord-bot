import type { UsingClient } from "seyfert";
import { AutoRoleGrantsStore, AutoRoleRulesStore } from "../data/store";
import type { AutoRoleRule } from "../domain/types";
import { isFeatureEnabled, Features } from "@/modules/features";
import { AutoroleService } from "../service";
import { autoroleKeys } from "../data/store";

const DEFAULT_INTERVAL_MS = 60_000;

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
    const dueRes = await AutoRoleGrantsStore.find({
      type: "TIMED",
      expiresAt: { $ne: null, $lte: now } as any,
    });

    if (dueRes.isErr()) return;
    const due = dueRes.unwrap();
    if (!due.length) return;

    const ruleCache = new Map<string, AutoRoleRule>();

    for (const grant of due) {
      const enabled = await isFeatureEnabled(grant.guildId, Features.Autoroles);
      if (!enabled) continue;

      const key = `${grant.guildId}:${grant.ruleName}`;
      let rule = ruleCache.get(key);

      if (!rule) {
        const fetchedRes = await AutoRoleRulesStore.get(
          autoroleKeys.rule(grant.guildId, grant.ruleName),
        );
        if (fetchedRes.isOk() && fetchedRes.unwrap()) {
          rule = fetchedRes.unwrap()!;
        } else {
          // Fallback rule if it was deleted but grant remains
          rule = {
            _id: autoroleKeys.rule(grant.guildId, grant.ruleName),
            id: autoroleKeys.rule(grant.guildId, grant.ruleName),
            guildId: grant.guildId,
            name: grant.ruleName,
            trigger: { type: "MESSAGE_REACT_ANY", args: {} },
            roleId: grant.roleId,
            durationMs: grant.expiresAt
              ? Math.max(
                  grant.expiresAt.getTime() - grant.createdAt.getTime(),
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

      await AutoroleService.revokeByRule({
        client,
        rule,
        userId: grant.userId,
        reason: `autorole:${grant.ruleName}:expire`,
        grantType: "TIMED",
      });
    }
  } catch (error) {
    client.logger?.error?.("[autorole] timed grant sweep failed", { error });
  } finally {
    ticking = false;
  }
}
