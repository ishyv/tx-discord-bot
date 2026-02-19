/**
 * Store Admin Parent Command.
 *
 * Purpose: Manage guild store items (add, edit, remove).
 * Subcommands: add, edit, remove.
 */

import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "store-admin",
  category: HelpCategory.Economy,
  description: "Manage guild store items — add, edit, and remove listings",
  usage: "/store-admin add | /store-admin edit | /store-admin remove",
  permissions: ["Administrator"],
})
@Declare({
    name: "store-admin",
    description: "Manage guild store items",
    defaultMemberPermissions: ["Administrator"],
})
@AutoLoad()
export default class StoreAdminParentCommand extends Command { }
