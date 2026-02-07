/**
 * RPG System Module.
 *
 * Purpose: Public API exports for the RPG system layered on top of economy.
 * Context: Combat, equipment, gathering, processing, and upgrades.
 * Dependencies: Economy system (account, inventory, mutations, audit).
 */

// Profile module (re-export all)
export * from "./profile";

// Types from core types file (not profile)
export type {
  EquipmentSlots,
  CombatState,
  CombatStats,
  ToolInstance,
  CombatRound,
  CombatMove,
  CombatResult,
} from "./types";

// Services
export { rpgEquipmentService } from "./equipment/service";
export { rpgCombatService } from "./combat/service";
export { rpgFightService } from "./combat/fight-service";
export { rpgGatheringService } from "./gathering/service";
export { rpgProcessingService } from "./processing/service";
export { rpgUpgradeService } from "./upgrades/service";

// Stats calculator
export { StatsCalculator } from "./stats/calculator";
export type { CalculatedStats } from "./stats/types";

// Views
export { RpgViews } from "./views/embeds";
export { CombatLogFormatter } from "./views/combat-log";
export { HpBarRenderer } from "./views/hp-bar";

// Config
export { RPG_CONFIG, COMBAT_CONFIG, GATHERING_CONFIG, PROCESSING_CONFIG } from "./config";

// Fight-related exports
export { rpgFightRepo } from "./combat/fight-repository";
export type {
  RpgFightData,
  FightPlayerSnapshot,
  FightRound,
  FightStatus,
} from "./combat/fight-schema";
export { createFightData } from "./combat/fight-schema";

// Quests
export * from "./quests";
