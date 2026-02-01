/**
 * Channels Parent Command.
 *
 * Purpose: Manage bot-related channels.
 */
import { AutoLoad, Command, Declare } from "seyfert";

// Root namespace for channel management commands.
@Declare({
  name: "channels",
  description: "Manage channels used by the bot",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class ChannelParentCommand extends Command { }
