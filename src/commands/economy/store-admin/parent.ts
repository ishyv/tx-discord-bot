/**
 * Store Admin Parent Command.
 *
 * Purpose: Manage guild store items (add, edit, remove).
 * Subcommands: add, edit, remove.
 */

import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
    name: "store-admin",
    description: "Manage guild store items",
    defaultMemberPermissions: ["Administrator"],
})
@AutoLoad()
export default class StoreAdminParentCommand extends Command { }
