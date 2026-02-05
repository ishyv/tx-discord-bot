/**
 * RPG Profile module exports.
 */

// Types
export type {
  RpgProfile,
  ProfileEnsureResult,
  ProfileView,
  ProfileViewOptions,
  EquipInput,
  EquipResult,
  EquipmentSlot,
  Loadout,
  RpgError,
  RpgErrorCode,
} from "./types";

// Schema (re-export from db/schemas for convenience)
export {
  RpgProfileSchema,
  LoadoutSchema,
  parseRpgProfile,
  detectCorruption,
  repairRpgProfile,
  defaultLoadout,
  type RpgProfileData,
  type RpgProfilePatch,
  type EquipmentSlot as EquipmentSlotType,
} from "@/db/schemas/rpg-profile";

// Repository
export { rpgProfileRepo, type RpgProfileRepo } from "./repository";

// Service
export { rpgProfileService, type RpgProfileService } from "./service";
