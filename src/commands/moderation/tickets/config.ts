
import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

// Define schema for CoreChannel items (nullable/optional)
const CoreChannelSchema = z.object({ channelId: z.string() }).nullable().optional();

// Define Tickets schema mapping to channels.core structure
export const ticketsConfig = defineConfig(ConfigurableModule.Tickets, z.object({
    tickets: CoreChannelSchema,
    ticketLogs: CoreChannelSchema,
    ticketCategory: CoreChannelSchema
}));

declare module "@/configuration/definitions" {
    export interface ConfigDefinitions {
        [ConfigurableModule.Tickets]: z.infer<typeof ticketsConfig>;
    }
}
