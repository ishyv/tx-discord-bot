/**
 * UI Module Index.
 *
 * Purpose: Provide interface primitives for managing registration and execution
 * of interactive components.
 *
 * Concept: Maintains a system of signals/sessions and augmentations so Seyfert
 * handlers can resolve customIds.
 *
 * Scope: Organizes UI infrastructure; does not define component content or
 * business rules.
 */
export * from "./ui";
export * from "./signals";
export * from "./sessions";
export * from "./design-system";
export { Button } from "seyfert";
