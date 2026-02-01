/**
 * Economy Config Parent Command.
 *
 * Purpose: Expose guild economy configuration (view) and admin-only updates (set).
 * Subcommands: view (mod/admin), set (admin only).
 */

import { AutoLoad, Command, Declare } from "seyfert";

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
