/**
 * RPG Onboarding Service.
 *
 * Purpose: Handle first-time RPG user onboarding with starter kit grants.
 * Context: Called when a user without a starter kit calls /rpg profile.
 * Dependencies: Profile service, item mutation services, config, audit.
 *
 * Invariants:
 * - Starter kit can only be claimed once (tracked in profile).
 * - Onboarding must be enabled in guild config.
 * - All granted items are audited with correlationId.
 * - Tools are granted as instances with full durability.
 * - Gear is granted as stackable items.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import type { UserId } from "@/db/types";
import type { RpgProfileData, StarterKitType } from "@/db/schemas/rpg-profile";
import { UserStore } from "@/db/repositories/users";
import { rpgConfigService } from "../config/service";
import { DEFAULT_ONBOARDING_CONFIG } from "../config/defaults";
import { itemInstanceService } from "@/modules/economy/mutations/items/instance-service";
import { itemMutationService } from "@/modules/economy/mutations/items/service";
import { economyAuditRepo } from "@/modules/economy/audit/repository";
import { getItemDefinition } from "@/modules/inventory/items";
import { isInstanceBased } from "@/modules/inventory/instances";
import type {
    StarterPath,
    GrantedItem,
    ClaimStarterKitResult,
    ClaimStarterKitInput,
    OnboardingStatus,
} from "./types";
import { OnboardingError } from "./types";

/** Generate a correlation ID for tracing. */
function generateCorrelationId(): string {
    return `onboard_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Always return true for starter kit grants (system-level admin check bypass). */
async function alwaysAllowed(): Promise<boolean> {
    return true;
}

/** Onboarding service interface. */
export interface OnboardingService {
    /**
     * Check if a user needs onboarding.
     */
    checkStatus(
        userId: UserId,
        guildId: string,
    ): Promise<Result<OnboardingStatus, OnboardingError>>;

    /**
     * Claim a starter kit for a user.
     */
    claimStarterKit(
        input: ClaimStarterKitInput,
    ): Promise<Result<ClaimStarterKitResult, OnboardingError>>;
}

class OnboardingServiceImpl implements OnboardingService {
    async checkStatus(
        userId: UserId,
        guildId: string,
    ): Promise<Result<OnboardingStatus, OnboardingError>> {
        // Get guild config
        const configResult = await rpgConfigService.getConfig(guildId);
        const onboardingConfig =
            configResult.isOk() && configResult.unwrap().onboarding
                ? configResult.unwrap().onboarding!
                : DEFAULT_ONBOARDING_CONFIG;

        // Get user profile
        const userResult = await UserStore.get(userId);
        if (userResult.isErr() || !userResult.unwrap()) {
            return OkResult({
                needsOnboarding: onboardingConfig.enabled,
                onboardingEnabled: onboardingConfig.enabled,
                existingPath: null,
                claimedAt: null,
            });
        }

        const user = userResult.unwrap()!;
        const profile = user.rpgProfile as RpgProfileData | undefined;

        // Check if they already claimed
        const existingPath = profile?.starterKitType ?? null;
        const claimedAt = profile?.starterKitClaimedAt ?? null;

        return OkResult({
            needsOnboarding: onboardingConfig.enabled && existingPath === null,
            onboardingEnabled: onboardingConfig.enabled,
            existingPath: existingPath as StarterPath | null,
            claimedAt,
        });
    }

    async claimStarterKit(
        input: ClaimStarterKitInput,
    ): Promise<Result<ClaimStarterKitResult, OnboardingError>> {
        const correlationId = generateCorrelationId();
        const { userId, guildId, path } = input;

        // Validate path
        if (path !== "miner" && path !== "lumber") {
            return ErrResult(
                new OnboardingError("Invalid starter kit path", "INVALID_PATH"),
            );
        }

        // Check status first
        const statusResult = await this.checkStatus(userId, guildId);
        if (statusResult.isErr()) {
            return ErrResult(statusResult.error);
        }

        const status = statusResult.unwrap();

        if (!status.onboardingEnabled) {
            return ErrResult(
                new OnboardingError(
                    "Onboarding is disabled for this guild",
                    "ONBOARDING_DISABLED",
                ),
            );
        }

        if (status.existingPath !== null) {
            return ErrResult(
                new OnboardingError(
                    `You already claimed a starter kit (${status.existingPath} path)`,
                    "ALREADY_CLAIMED",
                ),
            );
        }

        // Get config for kit contents
        const configResult = await rpgConfigService.getConfig(guildId);
        const onboardingConfig =
            configResult.isOk() && configResult.unwrap().onboarding
                ? configResult.unwrap().onboarding!
                : DEFAULT_ONBOARDING_CONFIG;

        const kitDef = onboardingConfig.starterKits[path];
        if (!kitDef) {
            return ErrResult(
                new OnboardingError(
                    `Starter kit definition not found for ${path}`,
                    "INTERNAL_ERROR",
                ),
            );
        }

        const grantedItems: GrantedItem[] = [];
        const claimedAt = new Date();

        // Grant the tool (instance-based)
        const toolDef = getItemDefinition(kitDef.toolId);
        if (!toolDef) {
            return ErrResult(
                new OnboardingError(
                    `Tool item not found: ${kitDef.toolId}`,
                    "INTERNAL_ERROR",
                ),
            );
        }

        if (isInstanceBased(kitDef.toolId)) {
            const toolGrantResult = await itemInstanceService.grantInstance({
                actorId: userId, // Self-grant for onboarding
                targetId: userId,
                guildId,
                itemId: kitDef.toolId,
                durability: toolDef.tool?.maxDurability,
                reason: `Starter kit (${path} path)`,
                correlationId,
            });

            if (toolGrantResult.isErr()) {
                return ErrResult(
                    new OnboardingError(
                        `Failed to grant tool: ${toolGrantResult.error.message}`,
                        "GRANT_FAILED",
                    ),
                );
            }

            grantedItems.push({
                itemId: kitDef.toolId,
                instanceId: toolGrantResult.unwrap().instance.instanceId,
                qty: 1,
                isTool: true,
            });
        } else {
            // Fallback for non-instance tools (shouldn't happen normally)
            const toolGrantResult = await itemMutationService.adjustItemQuantity(
                {
                    actorId: userId,
                    targetId: userId,
                    guildId,
                    itemId: kitDef.toolId,
                    delta: 1,
                    reason: `Starter kit (${path} path)`,
                },
                alwaysAllowed,
            );

            if (toolGrantResult.isErr()) {
                return ErrResult(
                    new OnboardingError(
                        `Failed to grant tool: ${toolGrantResult.error.message}`,
                        "GRANT_FAILED",
                    ),
                );
            }

            grantedItems.push({
                itemId: kitDef.toolId,
                qty: 1,
                isTool: true,
            });
        }

        // Grant gear items
        for (const gear of kitDef.gear) {
            if (isInstanceBased(gear.id)) {
                // Instance-based gear (armor, etc.)
                for (let i = 0; i < gear.qty; i++) {
                    const gearDef = getItemDefinition(gear.id);
                    const grantResult = await itemInstanceService.grantInstance({
                        actorId: userId,
                        targetId: userId,
                        guildId,
                        itemId: gear.id,
                        durability: gearDef?.tool?.maxDurability,
                        reason: `Starter kit gear (${path} path)`,
                        correlationId,
                    });

                    if (grantResult.isErr()) {
                        // Log but continue - partial success is okay
                        console.error(
                            `[Onboarding] Failed to grant gear ${gear.id}:`,
                            grantResult.error,
                        );
                        continue;
                    }

                    grantedItems.push({
                        itemId: gear.id,
                        instanceId: grantResult.unwrap().instance.instanceId,
                        qty: 1,
                        isTool: false,
                    });
                }
            } else {
                // Stackable gear
                const grantResult = await itemMutationService.adjustItemQuantity(
                    {
                        actorId: userId,
                        targetId: userId,
                        guildId,
                        itemId: gear.id,
                        delta: gear.qty,
                        reason: `Starter kit gear (${path} path)`,
                    },
                    alwaysAllowed,
                );

                if (grantResult.isErr()) {
                    console.error(
                        `[Onboarding] Failed to grant gear ${gear.id}:`,
                        grantResult.error,
                    );
                    continue;
                }

                grantedItems.push({
                    itemId: gear.id,
                    qty: gear.qty,
                    isTool: false,
                });
            }
        }

        // Update profile with starter kit claim
        const patchResult = await UserStore.patch(userId, {
            "rpgProfile.starterKitType": path as StarterKitType,
            "rpgProfile.starterKitClaimedAt": claimedAt,
            "rpgProfile.updatedAt": claimedAt,
        } as any);

        if (patchResult.isErr()) {
            return ErrResult(
                new OnboardingError(
                    "Failed to update profile with starter kit claim",
                    "INTERNAL_ERROR",
                ),
            );
        }

        // Create main audit entry
        await economyAuditRepo.create({
            operationType: "item_grant",
            actorId: userId,
            targetId: userId,
            guildId,
            source: "rpg_onboarding",
            reason: `Claimed ${path} starter kit`,
            metadata: {
                correlationId,
                starterKitPath: path,
                grantedItems: grantedItems.map((item) => ({
                    itemId: item.itemId,
                    instanceId: item.instanceId,
                    qty: item.qty,
                    isTool: item.isTool,
                })),
            },
        });

        return OkResult({
            path,
            grantedItems,
            correlationId,
            claimedAt,
        });
    }
}

/** Singleton instance. */
export const onboardingService: OnboardingService = new OnboardingServiceImpl();
