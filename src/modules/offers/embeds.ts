/**
 * Motivación: separar la lógica de presentación (Embeds, Botones) de la lógica de negocio.
 *
 * Idea/concepto: provee funciones puras que transforman datos de ofertas en componentes de UI de Discord.
 *
 * Alcance: solo construcción de UI; no realiza operaciones de I/O ni lógica de estado.
 */
import { ActionRow, Button, Embed } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";
import type { Offer, OfferDetails, OfferStatus } from "./types";

export const STATUS_LABEL: Record<OfferStatus, string> = {
    PENDING_REVIEW: "Pendiente de revisión",
    APPROVED: "Aprobada",
    REJECTED: "Rechazada",
    CHANGES_REQUESTED: "Cambios solicitados",
    WITHDRAWN: "Retirada por el autor",
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
    return list.map((tag) => tag.trim()).filter(Boolean).join(", ");
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
        fields.push({ name: "Requisitos", value: details.requirements, inline: false });
    }
    if (details.workMode) {
        fields.push({ name: "Modalidad", value: details.workMode, inline: true });
    }
    if (details.salary) {
        fields.push({ name: "Rango salarial", value: details.salary, inline: true });
    }
    if (details.location) {
        fields.push({ name: "Ubicación / zona horaria", value: details.location, inline: true });
    }

    const labels = summarizeList(details.labels);
    if (labels) {
        fields.push({ name: "Etiquetas", value: labels, inline: false });
    }

    if (details.contact) {
        fields.push({ name: "Contacto", value: details.contact, inline: false });
    }

    if (opts.includeMeta) {
        fields.push({
            name: "Autor",
            value: opts.authorTag,
            inline: true,
        });
        fields.push({
            name: "Estado",
            value: STATUS_LABEL[opts.status],
            inline: true,
        });
    }

    if (opts.note) {
        fields.push({ name: "Nota", value: opts.note, inline: false });
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
        .setTitle(`Oferta ${STATUS_LABEL[status]}`)
        .setColor(STATUS_COLOR[status] ?? EmbedColors.Blurple)
        .setFooter({
            text: `ID: ${offer.id} · ${STATUS_LABEL[status]}`,
        })
        .addFields([
            { name: "Autor", value: `<@${offer.authorId}>`, inline: true },
            { name: "Estado", value: STATUS_LABEL[status], inline: true },
            {
                name: "Creada",
                value: offer.createdAt ? `<t:${Math.floor(offer.createdAt.getTime() / 1000)}:R>` : "N/D",
                inline: true,
            },
        ]);

    if (note) {
        embed.addFields([{ name: "Nota", value: note, inline: false }]);
    }

    return embed;
}

/** Reconstruye el embed del usuario desde los datos guardados. */
export function getUserEmbedFromOffer(offer: Offer): Embed {
    return new Embed(offer.embed);
}

/** Crea los botones de moderación. */
export function buildReviewButtons(
    offerId: string,
    disabled = false,
): ActionRow<Button> {
    const accept = new Button()
        .setCustomId(`offer:accept:${offerId}`)
        .setLabel("✅ Aceptar")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled);

    const reject = new Button()
        .setCustomId(`offer:reject:${offerId}`)
        .setLabel("❌ Rechazar")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled);

    const requestChanges = new Button()
        .setCustomId(`offer:changes:${offerId}`)
        .setLabel("✏️ Pedir cambios")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);

    return new ActionRow<Button>().addComponents(accept, reject, requestChanges);
}
