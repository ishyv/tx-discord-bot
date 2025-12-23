/**
 * Forum auto-reply config schema registration.
 *
 * Role in system:
 * - Defines the list of forum channel IDs that should trigger AI auto-replies.
 *
 * Invariants:
 * - Stored under `forumAutoReply` as a simple list.
 *
 * Gotchas:
 * - Registration is side-effectful; it must be imported by `configuration/register`.
 */
import { defineConfig, z } from "@/configuration/definitions";
import { ConfigurableModule } from "@/configuration/constants";

export const forumAutoReplyConfig = defineConfig(
  ConfigurableModule.ForumAutoReply,
  z.object({
    forumIds: z.array(z.string()).default(() => []),
  }),
  { path: "forumAutoReply" },
);

declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.ForumAutoReply]: z.infer<typeof forumAutoReplyConfig>;
  }
}
