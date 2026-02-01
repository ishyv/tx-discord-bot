/**
 * Tickets config schema registration.
 *
 * Role in system:
 * - Defines the per-guild channels used by the tickets workflow.
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

// Define Tickets schema mapping to channels.core structure
export const ticketsConfig = defineConfig(
  ConfigurableModule.Tickets,
  z.object({
    tickets: CoreChannelSchema,
    ticketLogs: CoreChannelSchema,
    ticketCategory: CoreChannelSchema,
  }),
  { path: "channels.core" },
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.Tickets]: z.infer<typeof ticketsConfig>;
  }
}
