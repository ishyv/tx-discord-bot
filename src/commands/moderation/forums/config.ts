import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

export const forumAutoReplyConfig = defineConfig(
  ConfigurableModule.ForumAutoReply,
  z.object({
    forumIds: z.array(z.string()).default(() => []),
  }),
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.ForumAutoReply]: z.infer<typeof forumAutoReplyConfig>;
  }
}
