/**
 * Channels Parent Command.
 *
 * Purpose: Manage bot-related channels.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

// Root namespace for channel management commands.
@HelpDoc({
  command: "channels",
  category: HelpCategory.Moderation,
  description: "Manage channels used by the bot — add, remove, set, and list",
  usage: "/channels",
  permissions: ["ManageChannels"],
})
@Declare({
  name: "channels",
  description: "Manage channels used by the bot",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class ChannelParentCommand extends Command { }
