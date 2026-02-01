/**
 * Warn Commands (Parent).
 *
 * Purpose: Register the parent command for user warnings.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "warn",
  description: "Manage user warnings",
  defaultMemberPermissions: ["KickMembers"],
})
@AutoLoad()
export default class WarnParent extends Command { }
