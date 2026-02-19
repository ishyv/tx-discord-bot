/**
 * Economy Audit Parent Command.
 *
 * Purpose: Query recent audit entries with filters (mod/admin).
 * Subcommands: recent.
 */

import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "economy-audit",
  category: HelpCategory.Economy,
  description: "Query the economy audit log with filters (mod/admin)",
  usage: "/economy-audit recent [user] [operation] [limit]",
  permissions: ["ManageGuild"],
})
@Declare({
  name: "economy-audit",
  description: "Query economy audit log (mod/admin)",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
  defaultMemberPermissions: ["ManageGuild"],
})
@AutoLoad()
export default class EconomyAuditParentCommand extends Command {}
