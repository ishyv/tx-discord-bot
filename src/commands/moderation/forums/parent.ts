/**
 * Forums Parent Command.
 *
 * Purpose: Configure AI-monitored forums.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "forums",
  category: HelpCategory.Moderation,
  description: "Manage forums monitored by the AI — add, remove, and list monitored forums",
  usage: "/forums",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "forums",
  description: "Manage forums monitored by the AI",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class ForumsParentCommand extends Command { }
