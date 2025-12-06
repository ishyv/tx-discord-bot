
import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

export const reputationConfig = defineConfig(ConfigurableModule.Reputation, z.object({
    keywords: z.array(z.string()).default([])
}));

declare module "@/configuration/definitions" {
    export interface ConfigDefinitions {
        [ConfigurableModule.Reputation]: z.infer<typeof reputationConfig>;
    }
}
