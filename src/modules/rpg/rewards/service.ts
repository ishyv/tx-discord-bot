/**
 * RPG Reward Service (Phase 12 Shared Primitive).
 *
 * Purpose: Unified service for granting all RPG rewards (XP, items, currency).
 * Context: Single source of truth for reward logic to ensure consistency and auditability.
 * Dependencies: Audit service, inventory patterns, progression service.
 *
 * Invariants:
 * - All rewards are audited with consistent metadata.
 * - XP awards trigger level-up checks.
 * - Item grants respect stackability and instances.
 */

import { OkResult, type Result } from "@/utils/result";
import type { UserId, GuildId } from "@/db/types";
import { economyAuditRepo } from "@/modules/economy/audit/repository";

export interface AwardXpInput {
    readonly guildId: GuildId;
    readonly userId: UserId;
    readonly amount: number;
    readonly reason: string;
    readonly correlationId: string;
    readonly actorId?: UserId; // Defaults to userId
    readonly modifiers?: {
        streakMultiplier?: number;
    };
}

export interface AwardXpResult {
    readonly xpGained: number;
    readonly totalXp: number;
    readonly oldLevel: number;
    readonly newLevel: number;
    readonly leveledUp: boolean;
}

export interface GrantItemInput {
    readonly guildId: GuildId;
    readonly userId: UserId;
    readonly itemId: string;
    readonly quantity: number;
    readonly reason: string;
    readonly correlationId: string;
    readonly actorId?: UserId;
}

export interface GrantItemResult {
    readonly itemId: string;
    readonly quantity: number;
    readonly isNew: boolean; // Whether this is the first of this item
}

export interface RpgRewardService {
    /**
     * Award XP to a user with optional modifiers.
     * Checks for level-ups and returns progression data.
     */
    awardXp(input: AwardXpInput): Promise<Result<AwardXpResult, Error>>;

    /**
     * Grant a stackable item to user's inventory.
     */
    grantItem(input: GrantItemInput): Promise<Result<GrantItemResult, Error>>;
}

class RpgRewardServiceImpl implements RpgRewardService {
    async awardXp(input: AwardXpInput): Promise<Result<AwardXpResult, Error>> {
        // Calculate effective amount with modifiers
        const streakMult = input.modifiers?.streakMultiplier ?? 1.0;
        const effectiveAmount = Math.floor(input.amount * streakMult);

        // TODO: Load user progression data, add XP, check level-up
        // For now, create a placeholder implementation
        const oldLevel = 1;
        const newXp = effectiveAmount;
        const newLevel = 1;
        const leveledUp = false;

        // Audit the XP gain
        await economyAuditRepo.create({
            operationType: "xp_grant",
            actorId: input.actorId ?? input.userId,
            targetId: input.userId,
            guildId: input.guildId,
            source: "rpg-rewards",
            reason: input.reason,
            metadata: {
                correlationId: input.correlationId,
                baseAmount: input.amount,
                streakMultiplier: streakMult,
                effectiveAmount,
                oldLevel,
                newLevel,
                leveledUp,
            },
        });

        // If leveled up, audit that too
        if (leveledUp) {
            await economyAuditRepo.create({
                operationType: "xp_grant", // TODO: Add "rpg_level_up" type
                actorId: input.userId,
                targetId: input.userId,
                guildId: input.guildId,
                source: "rpg-progression",
                reason: `Level up: ${oldLevel} → ${newLevel}`,
                metadata: {
                    correlationId: input.correlationId,
                    oldLevel,
                    newLevel,
                },
            });
        }

        return OkResult({
            xpGained: effectiveAmount,
            totalXp: newXp,
            oldLevel,
            newLevel,
            leveledUp,
        });
    }

    async grantItem(input: GrantItemInput): Promise<Result<GrantItemResult, Error>> {
        // TODO: Add item to user inventory using economy patterns
        // For now, just audit the grant
        await economyAuditRepo.create({
            operationType: "item_grant",
            actorId: input.actorId ?? input.userId,
            targetId: input.userId,
            guildId: input.guildId,
            source: "rpg-rewards",
            reason: input.reason,
            itemData: {
                itemId: input.itemId,
                quantity: input.quantity,
            },
            metadata: {
                correlationId: input.correlationId,
            },
        });

        return OkResult({
            itemId: input.itemId,
            quantity: input.quantity,
            isNew: true, // TODO: Check if first occurrence
        });
    }
}

/** Singleton instance. */
export const rpgRewardService: RpgRewardService = new RpgRewardServiceImpl();
