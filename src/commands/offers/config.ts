/**
 * Offers config schema registration.
 *
 * Role in system:
 * - Defines the per-guild channels used by the offers workflow.
 *
 * Invariants:
 * - Stored under `channels.core` to keep channel IDs centralized.
 *
 * Gotchas:
 * - Registration is side-effectful; it must be imported by `configuration/register`.
 */
import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

// WHY: allow undefined (missing) and null (explicit reset) to keep commands flexible.
const CoreChannelSchema = z
  .object({ channelId: z.string() })
  .nullable()
  .optional();

/**
 * Offers system configuration.
 *
 * Stored in `channels.core`:
 * - `offersReview`: channel where offers are sent for review (required to create offers).
 * - `approvedOffers`: channel where approved offers are published (optional).
 */
export const offersConfig = defineConfig(
  ConfigurableModule.Offers,
  z.object({
    offersReview: CoreChannelSchema,
    approvedOffers: CoreChannelSchema,
  }),
  { path: "channels.core" },
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.Offers]: z.infer<typeof offersConfig>;
  }
}
