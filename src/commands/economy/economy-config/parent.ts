/**
 * Economy Config Parent Command.
 *
 * Purpose: Expose guild economy configuration (view) and admin-only updates (set).
 * Subcommands: view (mod/admin), set (admin only).
 */

import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "economy-config",
  category: HelpCategory.Economy,
  description: "View or set guild economy configuration: tax, sectors, thresholds, and more",
  usage: "/economy-config view | /economy-config set-tax-rate <rate>",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "economy-config",
  description:
    "View or set guild economy configuration (tax, sectors, thresholds)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class EconomyConfigParentCommand extends Command {}
