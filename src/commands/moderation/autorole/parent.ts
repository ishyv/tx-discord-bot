/**
 * Autorole Parent Command.
 *
 * Purpose: Manage auto-role rules for the server.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "autorole",
  category: HelpCategory.Moderation,
  description: "Manage auto-role rules — create, delete, enable, disable, and list rules",
  usage: "/autorole",
  permissions: ["ManageRoles"],
})
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
