/**
 * Offer Edit Command.
 *
 * Purpose: Edit an active job offer using the embed designer.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { editOfferContent, getActiveOffer } from "@/modules/offers";
import { startEmbedDesigner } from "@/modules/prefabs/embedDesigner";
import {
  OFFER_FIELD_DEFINITIONS,
  ensureGuildContext,
  parseOfferDetails,
  buildDesignerFields,
} from "./shared";
import { Cooldown, CooldownType } from "@/modules/cooldown";

@Declare({
  name: "edit",
  description: "Edit your active offer (returns to review)",
})
@Cooldown({
  type: CooldownType.User,
  interval: 30000, // 30 seconds - prevent edit spam
  uses: { default: 1 },
})
export default class OfferEditCommand extends SubCommand {
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
        content:
          "You don't have active offers to edit. Use `/offer create` to submit a new one.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content:
        "Edit your offer information using the menu and confirm to resend it for review.",
      initial: {
        title: offer.details.title,
        description: offer.details.description,
        footer: "Job offer (will be sent for review)",
        fields: buildDesignerFields(offer.details),
      },
      fields: OFFER_FIELD_DEFINITIONS,
      onSubmit: async ({ data, embed }) => {
        const { details, error } = parseOfferDetails(data);
        if (!details) {
          await ctx.followup?.({
            content: error ?? "Incomplete offer data.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const updatedResult = await editOfferContent(
          ctx.client,
          offer,
          details,
          embed,
        );

        if (updatedResult.isErr()) {
          const message =
            updatedResult.error instanceof Error
              ? updatedResult.error.message
              : "Unknown error editing the offer.";
          await ctx.followup?.({
            content: `Could not edit the offer: ${message}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const updated = updatedResult.unwrap();

        if (!updated) {
          await ctx.followup?.({
            content: "Could not update the offer. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await ctx.followup?.({
          content:
            "Offer updated. Returned to *Pending Review* status.",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
  }
}
