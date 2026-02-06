/**
 * RPG RNG Utilities (Phase 12 Shared Primitives).
 *
 * Purpose: Deterministic RNG for RPG actions (drops, progression, etc).
 * Context: All probability-based RPG mechanics use these utilities for reproducibility.
 * Dependencies: Combat engine's RNG pattern (Mulberry32).
 */

import { createRng, nextRandom, nextInt, nextFloat } from "../combat/engine";
import type { RngState } from "../combat/types";

// Re-export types and functions
export type { RngState };
export { createRng, nextRandom, nextInt, nextFloat };

/**
 * Create a deterministic RNG for an RPG action.
 *
 * @param params Seed parameters
 * @param params.guildId Guild ID
 * @param params.userId User ID
 * @param params.correlationId Correlation ID (e.g., transaction ID, action timestamp)
 * @param params.actionType Type of action (e.g., "mine", "process", "upgrade")
 * @param params.actionIndex Action index (for multiple actions in same transaction)
 * @returns RNG state
 */
export function makeActionRng(params: {
    guildId: string;
    userId: string;
    correlationId: string;
    actionType: string;
    actionIndex?: number;
}): RngState {
    const { guildId, userId, correlationId, actionType, actionIndex = 0 } = params;

    // Create a stable seed from the parameters
    // Using a simple hash-like approach: sum of char codes
    const hashString = (str: string): number => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash >>> 0; // Ensure unsigned
    };

    const seed =
        hashString(guildId) ^
        hashString(userId) ^
        hashString(correlationId) ^
        hashString(actionType) ^
        actionIndex;

    return createRng(seed);
}

/**
 * Create an RNG from a simple seed value (for testing).
 */
export function makeSimpleRng(seed: number): RngState {
    return createRng(seed);
}

/**
 * Roll a probability check (0-1).
 * @param rng RNG state
 * @param chance Probability (0-1)
 * @returns True if success
 */
export function rollChance(rng: RngState, chance: number): boolean {
    return nextRandom(rng) < chance;
}

/**
 * Pick a random item from an array.
 * @param rng RNG state
 * @param items Array of items
 * @returns Random item
 */
export function pickRandom<T>(rng: RngState, items: T[]): T {
    const index = nextInt(rng, 0, items.length - 1);
    return items[index];
}

/**
 * Roll a random integer in range [min, max].
 */
export function rollInt(rng: RngState, min: number, max: number): number {
    return nextInt(rng, min, max);
}

/**
 * Roll a random float in range [min, max).
 */
export function rollFloat(rng: RngState, min: number, max: number): number {
    return nextFloat(rng, min, max);
}
