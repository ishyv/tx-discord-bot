/**
 * Autorole Parent Command.
 *
 * Purpose: Manage auto-role rules for the server.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "autorole",
  description: "Manage auto-role rules",
  defaultMemberPermissions: ["ManageRoles"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  botPermissions: ["ManageRoles"],
})
@AutoLoad()
export default class AutoroleParentCommand extends Command { }
