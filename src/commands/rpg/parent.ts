/**
 * RPG Commands (Parent).
 *
 * Purpose: Parent command for RPG system - profile, equipment, gathering.
 * Context: RPG character management and progression.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { HelpDoc, HelpCategory } from "@/modules/help";

@HelpDoc({
  command: "rpg",
  category: HelpCategory.RPG,
  description: "RPG system — manage your character profile, equipment, gather resources, fight, craft, and upgrade",
  usage: "/rpg profile | /rpg gather | /rpg fight | /rpg craft | /rpg loadout",
})
@Declare({
  name: "rpg",
  description: "🎮 RPG system - profile, loadout, gather, fight, craft, upgrade",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RpgParentCommand extends Command { }
