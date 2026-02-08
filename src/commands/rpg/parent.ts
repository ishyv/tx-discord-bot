/**
 * RPG Commands (Parent).
 *
 * Purpose: Parent command for RPG system - profile, equipment, gathering.
 * Context: RPG character management and progression.
 */
import { AutoLoad, Command, Declare } from "seyfert";

@Declare({
  name: "rpg",
  description: "🎮 RPG system - profile, loadout, gather, fight, craft, upgrade",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@AutoLoad()
export default class RpgParentCommand extends Command { }
