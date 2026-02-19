/**
 * Roles Parent Command.
 *
 * Purpose: Manage bot-administered roles.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

// Root namespace for bot role management.
@HelpDoc({
  command: "roles",
  category: HelpCategory.Moderation,
  description: "Manage bot-administered roles: set limits, assign, remove, and view dashboards",
  usage: "/roles",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "roles",
  description: "Manage roles administered by the bot",
  defaultMemberPermissions: ["ManageGuild"],
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RoleParentCommand extends Command { }
