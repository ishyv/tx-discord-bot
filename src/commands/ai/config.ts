import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

export const aiConfig = defineConfig(
  ConfigurableModule.AI,
  z.object({
    provider: z.string().default("gemini"),
    model: z.string().default("gemini-2.5-flash"),
  }),
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.AI]: z.infer<typeof aiConfig>;
  }
}
