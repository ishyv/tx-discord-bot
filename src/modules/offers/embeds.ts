/**
 * Motivación: separar la lógica de presentación (Embeds, Botones) de la lógica de negocio.
 *
 * Idea/concepto: provee funciones puras que transforman datos de ofertas en componentes de UI de Discord.
 *
 * Alcance: solo construcción de UI; no realiza operaciones de I/O ni lógica de estado.
 */
import { ActionRow, Button, Embed } from "seyfert";
import { ButtonStyle, type APIEmbed } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import type { Offer, OfferDetails, OfferStatus } from "./types";

export const STATUS_LABEL: Record<OfferStatus, string> = {
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes requested",
  WITHDRAWN: "Withdrawn by author",
};

export const STATUS_COLOR: Record<OfferStatus, number> = {
  PENDING_REVIEW: EmbedColors.Yellow,
  APPROVED: EmbedColors.Green,
  REJECTED: EmbedColors.Red,
  CHANGES_REQUESTED: EmbedColors.Orange,
  WITHDRAWN: EmbedColors.Grey,
};

interface EmbedOptions {
  status: OfferStatus;
  offerId: string;
  authorTag: string;
  authorAvatar?: string;
  note?: string | null;
  includeMeta?: boolean;
}

function summarizeList(list?: string[] | null): string | null {
  if (!list || list.length === 0) return null;
  return list
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(", ");
}

/** Crea el embed base (tanto para revisión como para publicación). */
export function buildOfferEmbed(
  details: OfferDetails,
  opts: EmbedOptions,
): Embed {
  const embed = new Embed()
    .setTitle(details.title)
    .setDescription(details.description)
    .setColor(STATUS_COLOR[opts.status] ?? EmbedColors.Blurple)
    .setFooter({
      text: `ID: ${opts.offerId} · ${STATUS_LABEL[opts.status]}`,
    });

  embed.setAuthor({ name: opts.authorTag, iconUrl: opts.authorAvatar });

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (details.requirements) {
    fields.push({
      name: "Requirements",
      value: details.requirements,
      inline: false,
    });
  }
  if (details.workMode) {
    fields.push({ name: "Work mode", value: details.workMode, inline: true });
  }
  if (details.salary) {
    fields.push({
      name: "Salary range",
      value: details.salary,
      inline: true,
    });
  }
  if (details.location) {
    fields.push({
      name: "Location / time zone",
      value: details.location,
      inline: true,
    });
  }

  const labels = summarizeList(details.labels);
  if (labels) {
    fields.push({ name: "Tags", value: labels, inline: false });
  }

  if (details.contact) {
    fields.push({ name: "Contact", value: details.contact, inline: false });
  }

  if (opts.includeMeta) {
    fields.push({
      name: "Author",
      value: opts.authorTag,
      inline: true,
    });
    fields.push({
      name: "Status",
      value: STATUS_LABEL[opts.status],
      inline: true,
    });
  }

  if (opts.note) {
    fields.push({ name: "Note", value: opts.note, inline: false });
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

/** Construye el embed de estado para el canal de revisión. */
export function buildStatusEmbed(
  offer: Offer,
  status: OfferStatus,
  note?: string | null,
): Embed {
  const embed = new Embed()
    .setTitle(`Offer ${STATUS_LABEL[status]}`)
    .setColor(STATUS_COLOR[status] ?? EmbedColors.Blurple)
    .setFooter({
      text: `ID: ${offer.id} · ${STATUS_LABEL[status]}`,
    })
    .addFields([
      { name: "Author", value: `<@${offer.authorId}>`, inline: true },
      { name: "Status", value: STATUS_LABEL[status], inline: true },
      {
        name: "Created",
        value: offer.createdAt
          ? `<t:${Math.floor(offer.createdAt.getTime() / 1000)}:R>`
          : "N/A",
        inline: true,
      },
    ]);

  if (note) {
    embed.addFields([{ name: "Note", value: note, inline: false }]);
  }

  return embed;
}

/** Reconstruye el embed del user desde los datos guardados. */
export function getUserEmbedFromOffer(offer: Offer): Embed {
  const embedData = (offer.embed ?? {}) as Partial<APIEmbed>;
  return new Embed(embedData);
}

/** Crea los botones de moderación. */
export function buildReviewButtons(
  offerId: string,
  disabled = false,
): ActionRow<Button> {
  const accept = new Button()
    .setCustomId(`offer:accept:${offerId}`)
    .setLabel("✅ Accept")
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  const reject = new Button()
    .setCustomId(`offer:reject:${offerId}`)
    .setLabel("❌ Reject")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(disabled);

  const requestChanges = new Button()
    .setCustomId(`offer:changes:${offerId}`)
    .setLabel("✏️ Request changes")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return new ActionRow<Button>().addComponents(accept, reject, requestChanges);
}


