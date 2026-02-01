/**
 * Roles Parent Command.
 *
 * Purpose: Manage bot-administered roles.
 */
import { AutoLoad, Command, Declare } from "seyfert";

// Root namespace for bot role management.
@Declare({
  name: "roles",
  description: "Manage roles administered by the bot",
  defaultMemberPermissions: ["ManageGuild"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RoleParentCommand extends Command { }
