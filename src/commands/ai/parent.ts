/**
 * AI Commands (Parent).
 *
 * Purpose: Register the parent command for AI provider and model configuration.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "ai",
  description: "Configure AI provider and model",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class AiParentCommand extends Command { }
