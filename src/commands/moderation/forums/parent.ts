/**
 * Forums Parent Command.
 *
 * Purpose: Configure AI-monitored forums.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "forums",
  description: "Manage forums monitored by the AI",
  defaultMemberPermissions: ["ManageChannels"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class ForumsParentCommand extends Command { }
