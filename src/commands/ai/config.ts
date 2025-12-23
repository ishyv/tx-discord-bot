/**
 * AI config schema registration.
 *
 * Role in system:
 * - Defines the per-guild AI settings stored at path "ai".
 *
 * Invariants:
 * - Defaults are applied by Zod so missing fields are safe.
 *
 * Gotchas:
 * - Registration is side-effectful; it must be imported by `configuration/register`.
 */
import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

export const aiConfig = defineConfig(
  ConfigurableModule.AI,
  z.object({
    provider: z.string().default("gemini"),
    model: z.string().default("gemini-2.5-flash"),
    rateLimitEnabled: z.boolean().default(false),
    rateLimitWindow: z.number().int().min(10).default(60),
    rateLimitMax: z.number().int().min(1).default(5),
  }),
  { path: "ai" },
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.AI]: z.infer<typeof aiConfig>;
  }
}
