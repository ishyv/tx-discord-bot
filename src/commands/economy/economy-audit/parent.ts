/**
 * Economy Audit Parent Command.
 *
 * Purpose: Query recent audit entries with filters (mod/admin).
 * Subcommands: recent.
 */

import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "economy-audit",
  description: "Query economy audit log (mod/admin)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class EconomyAuditParentCommand extends Command {}
