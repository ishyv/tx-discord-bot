/**
 * Offer Withdraw Command.
 *
 * Purpose: Withdraw an active job offer from review.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { withdrawOffer, getActiveOffer } from "@/modules/offers";
import { ensureGuildContext } from "./shared";

@Declare({
  name: "withdraw",
  description: "Withdraw your active offer",
})
export default class OfferWithdrawCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = await ensureGuildContext(ctx);
    if (!guildId) return;

    const offerResult = await getActiveOffer(guildId, ctx.author.id);
    if (offerResult.isErr()) {
      await ctx.write({
        content: "Error searching for active offers.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const offer = offerResult.unwrap();
    if (!offer) {
      await ctx.write({
        content: "You don't have an active offer to withdraw.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updatedResult = await withdrawOffer(ctx.client, offer, ctx.author.id);
    if (updatedResult.isErr()) {
      await ctx.write({
        content: "Error withdrawing the offer.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updated = updatedResult.unwrap();
    if (!updated) {
      await ctx.write({
        content: "Could not withdraw the offer. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({
      content: "Your offer was withdrawn and will no longer appear in review.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
