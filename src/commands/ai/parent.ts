/**
 * AI Commands (Parent).
 *
 * Purpose: Register the parent command for AI provider and model configuration.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "ai",
  category: HelpCategory.AI,
  description: "Configure AI provider, model, and rate limits for the server",
  usage: "/ai set-provider | /ai set-model | /ai ratelimit",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "ai",
  description: "Configure AI provider and model",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class AiParentCommand extends Command { }
