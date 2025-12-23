/**
 * Features config registration.
 *
 * Role in system:
 * - Registers the `features` config key and its storage path.
 *
 * Invariants:
 * - Stored values are a sparse map of feature => boolean.
 * - Defaults are applied in the feature service (not here).
 *
 * Gotchas:
 * - This schema is permissive to allow forward-compatible feature flags.
 */
import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

const featuresSchema = z.record(z.string(), z.boolean()).default(() => ({}));

export const featuresConfig = defineConfig(
  ConfigurableModule.Features,
  featuresSchema,
  { path: "features" },
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.Features]: z.infer<typeof featuresConfig>;
  }
}
