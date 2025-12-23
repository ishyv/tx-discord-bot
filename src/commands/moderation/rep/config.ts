/**
 * Reputation config schema registration.
 *
 * Role in system:
 * - Defines the keyword list used for reputation detection.
 *
 * Invariants:
 * - Stored under `reputation.keywords` as a list of strings.
 *
 * Gotchas:
 * - Registration is side-effectful; it must be imported by `configuration/register`.
 */
import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

export const reputationConfig = defineConfig(
    ConfigurableModule.Reputation,
    z.object({
        keywords: z.array(z.string()).default([]),
    }),
    { path: "reputation" },
);

declare module "@/configuration/definitions" {
    export interface ConfigDefinitions {
        [ConfigurableModule.Reputation]: z.infer<typeof reputationConfig>;
    }
}
