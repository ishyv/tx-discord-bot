/**
 * Gamble Commands (Parent).
 *
 * Purpose: Parent command for gambling/minigame features.
 * Context: Coinflip, future dice, slots, etc.
 */
import { AutoLoad, Command, Declare } from "seyfert";
import { BindDisabled, Features } from "@/modules/features";

@Declare({
    name: "gamble",
    description: "🎰 Gambling games - coinflip, dice, and more",
    contexts: ["Guild"],
    integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@AutoLoad()
export default class GambleParentCommand extends Command { }
