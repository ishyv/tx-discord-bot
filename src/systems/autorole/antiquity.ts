import type { UsingClient } from "seyfert";
import { autoRoleFetchAllRules } from "@/db/repositories";
import { syncUserAntiquityRoles } from "./service";
import { isFeatureEnabled } from "@/modules/features";

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

async function runAntiquityChecks(client: UsingClient) {
    try {
        const rules = await autoRoleFetchAllRules();
        const guildsToCheck = new Set<string>();

        for (const rule of rules) {
            if (rule.trigger.type === "ANTIQUITY_THRESHOLD" && rule.enabled) {
                guildsToCheck.add(rule.guildId);
            }
        }

        for (const guildId of guildsToCheck) {
            try {
                const featureEnabled = await isFeatureEnabled(guildId, "autoroles");
                if (!featureEnabled) continue;

                const members = await client.members.list(guildId);
                for (const member of members) {
                    await syncUserAntiquityRoles(client, guildId, member);
                }
            } catch (error) {
                client.logger?.error?.(`[autorole] failed to check antiquity for guild ${guildId}`, { error });
            }
        }
    } catch (error) {
        client.logger?.error?.("[autorole] antiquity scheduler failed", { error });
    }
}

