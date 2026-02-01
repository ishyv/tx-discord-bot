/**
 * Autorole Module
 *
 * Consolidates fragmented autorole logic into a single module.
 */

// Domain
export * from "./domain/types";
export * from "./domain/schema";
export * from "./domain/parsers";
export * from "./domain/validation";
export * from "./domain/presets";

// Data
export * from "./data/store";

// Service
export * from "./service";

// Cache
export * from "./cache";

// Engine
export * from "./engine/roleOps";
export * from "./engine/scheduler";
export * from "./engine/antiquity";
export * from "./engine/deleteSessions";
