/**
 * Motivación: encapsular el handler de componente "offers moderation buttons" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import {
  ActionRow,
  ComponentCommand,
  ComponentContext,
  Modal,
  TextInput,
} from "seyfert";
import { MessageFlags, TextInputStyle } from "seyfert/lib/types";
import { approveOffer } from "@/modules/offers";

const PREFIX = "offer:";

export default class OfferModerationButtons extends ComponentCommand {
  componentType = "Button" as const;

  filter(ctx: ComponentContext<"Button">) {
    return ctx.customId.startsWith(PREFIX);
  }

  async run(ctx: ComponentContext<"Button">) {
    const [_, action, offerId] = ctx.customId.split(":");
    if (!offerId || !action || !ctx.guildId) return;

    const canModerate =
      ctx.member?.permissions?.has?.(["ManageMessages"]) === true;
    if (!canModerate) {
      await ctx.write({
        content: "You need ManageMessages permission to moderate offers.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "accept") {
      await ctx.deferUpdate();
      const approved = await approveOffer(ctx.client, offerId, ctx.author.id);
      if (!approved) {
        await ctx.followup({
          content: "This offer was already processed or is no longer pending.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.followup({
        content: `Offer \`${offerId}\` approved and published (if a channel is configured).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "reject") {
      const modal = new Modal()
        .setCustomId(`offer:reject-modal:${offerId}`)
        .setTitle("Reject offer")
        .addComponents(
          new ActionRow<TextInput>().addComponents(
            new TextInput()
              .setCustomId("reason")
              .setLabel("Reason (optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setPlaceholder("Explain why it is being rejected"),
          ),
        );
      await ctx.interaction.modal(modal);
      return;
    }

    if (action === "changes") {
      const modal = new Modal()
        .setCustomId(`offer:changes-modal:${offerId}`)
        .setTitle("Request changes")
        .addComponents(
          new ActionRow<TextInput>().addComponents(
            new TextInput()
              .setCustomId("note")
              .setLabel("What to change")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder("Example: add salary range, clarify work mode..."),
          ),
        );
      await ctx.interaction.modal(modal);
      return;
    }
  }
}

