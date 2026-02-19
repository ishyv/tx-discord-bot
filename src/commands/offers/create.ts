/**
 * Offer Create Command.
 *
 * Purpose: Create a new job offer and send it for review.
 */
import { Declare, SubCommand, type GuildCommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { assertNoActiveOffer, createOfferForReview } from "@/modules/offers";
import { startEmbedDesigner } from "@/modules/prefabs/embedDesigner";
import {
  OFFER_FIELD_DEFINITIONS,
  ensureGuildContext,
  parseOfferDetails,
  buildDesignerFields,
} from "./shared";
import { Cooldown, CooldownType } from "@/modules/cooldown";

@HelpDoc({
  command: "offer create",
  category: HelpCategory.Offers,
  description: "Create a new job offer and submit it for staff review",
  usage: "/offer create",
})
@Declare({
  name: "create",
  description: "Create a new offer and send it for review",
})
@Cooldown({
  type: CooldownType.User,
  interval: 60000, // 60 seconds - prevent offer spam
  uses: { default: 1 },
})
export default class OfferCreateCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const guildId = await ensureGuildContext(ctx);
    if (!guildId) return;

    const existingResult = await assertNoActiveOffer(guildId, ctx.author.id);
    if (existingResult.isErr()) {
      await ctx.write({
        content: "Error checking active offers.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (existingResult.unwrap()) {
      await ctx.write({
        content:
          "You already have an active offer in review or with pending changes. Use `/offer edit` or `/offer withdraw` before creating a new one.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await startEmbedDesigner(ctx, {
      userId: ctx.author.id,
      content:
        "Complete your offer information using the menu and confirm to send it for review.",
      initial: {
        title: "Position Title",
        description: "Describe the role, responsibilities, and context.",
        footer: "Job offer (will be sent for review)",
        fields: buildDesignerFields(),
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

        const result = await createOfferForReview(ctx.client, {
          guildId,
          authorId: ctx.author.id,
          details,
          authorTag: ctx.author.username,
          authorAvatar: ctx.author.avatarURL(),
          userEmbed: embed,
        });

        if (result.isErr()) {
          const error = result.error;
          const message =
            error instanceof Error
              ? error.message
              : "Unknown error creating the offer.";

          await ctx.followup?.({
            content:
              message === "OFFERS_REVIEW_CHANNEL_MISSING"
                ? "No review channel configured."
                : message === "ACTIVE_OFFER_EXISTS"
                  ? "You already have an active offer in review or with pending changes."
                  : `Could not create the offer: ${message}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await ctx.followup?.({
          content: "Offer sent to the review channel.",
          flags: MessageFlags.Ephemeral,
        });
      },
    });
  }
}
