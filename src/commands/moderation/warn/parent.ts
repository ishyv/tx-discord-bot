/**
 * Warn Commands (Parent).
 *
 * Purpose: Register the parent command for user warnings.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "warn",
  category: HelpCategory.Moderation,
  description: "Manage user warnings — add, remove, list, or clear warnings",
  usage: "/warn",
  permissions: ["KickMembers"],
})
@Declare({
  name: "warn",
  description: "Manage user warnings",
  defaultMemberPermissions: ["KickMembers"],
})
@AutoLoad()
export default class WarnParent extends Command { }
