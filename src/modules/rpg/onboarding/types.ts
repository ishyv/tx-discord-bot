/**
 * RPG Onboarding Types.
 *
 * Purpose: Type definitions for the RPG onboarding flow.
 * Context: Used by onboarding service and commands.
 */

import type { StarterKitType } from "@/db/schemas/rpg-profile";

/** Starter kit path for onboarding. */
export type StarterPath = StarterKitType;

/** Granted item from starter kit. */
export interface GrantedItem {
    /** Item ID. */
    itemId: string;
    /** Instance ID (for instanced items like tools). */
    instanceId?: string;
    /** Quantity granted. */
    qty: number;
    /** Whether this was the main tool. */
    isTool: boolean;
}

/** Result of claiming a starter kit. */
export interface ClaimStarterKitResult {
    /** The path chosen. */
    path: StarterPath;
    /** Items granted. */
    grantedItems: GrantedItem[];
    /** Correlation ID for audit tracing. */
    correlationId: string;
    /** Timestamp of claim. */
    claimedAt: Date;
}

/** Input for claiming a starter kit. */
export interface ClaimStarterKitInput {
    /** User ID claiming the kit. */
    userId: string;
    /** Guild ID (for config lookup). */
    guildId: string;
    /** The path chosen (miner or lumber). */
    path: StarterPath;
}

/** Onboarding check result. */
export interface OnboardingStatus {
    /** Whether the user needs onboarding. */
    needsOnboarding: boolean;
    /** Whether onboarding is enabled for the guild. */
    onboardingEnabled: boolean;
    /** The path they already chose, if any. */
    existingPath: StarterPath | null;
    /** When they claimed their kit, if ever. */
    claimedAt: Date | null;
}

/** Error class for onboarding operations. */
export class OnboardingError extends Error {
    constructor(
        message: string,
        public readonly code:
            | "ALREADY_CLAIMED"
            | "ONBOARDING_DISABLED"
            | "INVALID_PATH"
            | "PROFILE_NOT_FOUND"
            | "GRANT_FAILED"
            | "INTERNAL_ERROR",
    ) {
        super(message);
        this.name = "OnboardingError";
    }
}
