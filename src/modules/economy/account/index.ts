/**
 * Economy Account Module.
 *
 * Purpose: Core account management for economy system.
 * Exports: Types, repository, service, and formatting utilities.
 */

export * from "./types";
export * from "./repository";
export * from "./service";
export * from "./formatting";
// Note: embeds.ts is NOT exported here to avoid conflicts with formatting.ts
// Import directly: import { ... } from "@/modules/economy/account/embeds"
