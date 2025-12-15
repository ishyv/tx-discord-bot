/**
 * Author: Repositories team
 * Purpose: Barrel file that exposes the autorole data stack (mappers, repos, cache-service, service, presets).
 * Why exists: Gives consumers a single import surface instead of reaching into individual implementation files.
 */
export * from "./autorole.repo";
export * from "./autorole.cache-service";
export * from "./autorole.service";
export * from "./autorole.presets";
