/**
 * Motivación: estructurar el módulo offers (service) en piezas reutilizables y autocontenidas.
 *
 * Idea/concepto: agrupa helpers y orquestadores bajo un mismo dominio para evitar acoplamientos dispersos.
 *
 * Alcance: soporte de dominio; no sustituye a los comandos o servicios que consumen el módulo.
 */
import { randomBytes } from "node:crypto";
import { ActionRow, Button, Embed, type UsingClient } from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { EmbedColors } from "seyfert/lib/common";

import {
	createOffer,
	findActiveByAuthor,
	findById,
	transitionOffer,
	updateOffer,
} from "@/db/repositories/offers";
import { getGuildChannels } from "@/modules/guild-channels";
import { logModerationAction } from "@/utils/moderationLogger";
import type { Offer, OfferDetails, OfferStatus } from "./types";

const STATUS_LABEL: Record<OfferStatus, string> = {
	PENDING_REVIEW: "Pendiente de revisión",
	APPROVED: "Aprobada",
	REJECTED: "Rechazada",
	CHANGES_REQUESTED: "Cambios solicitados",
	WITHDRAWN: "Retirada por el autor",
};

const STATUS_COLOR: Record<OfferStatus, number> = {
	PENDING_REVIEW: EmbedColors.Yellow,
	APPROVED: EmbedColors.Green,
	REJECTED: EmbedColors.Red,
	CHANGES_REQUESTED: EmbedColors.Orange,
	WITHDRAWN: EmbedColors.Grey,
};

export const ACTIVE_STATUSES: OfferStatus[] = [
	"PENDING_REVIEW",
	"CHANGES_REQUESTED",
];

/** Genera un ID corto y legible para la oferta. */
export function generateOfferId(): string {
	return randomBytes(5).toString("hex");
}

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

function buildStatusEmbed(
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

function getUserEmbedFromOffer(offer: Offer): Embed {
	return new Embed(offer.embed);
}

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

async function resolveChannels(guildId: string) {
	const channels = await getGuildChannels(guildId);
	const reviewChannelId = channels.core?.offersReview?.channelId ?? null;
	const approvedChannelId = channels.core?.approvedOffers?.channelId ?? null;
	const generalLogsId = channels.core?.generalLogs?.channelId ?? null;
	return { reviewChannelId, approvedChannelId, generalLogsId };
}

async function updateReviewMessage(
	client: UsingClient,
	offer: Offer,
	status: OfferStatus,
	note: string | null,
	disableButtons: boolean,
): Promise<boolean> {
	if (!offer.reviewChannelId || !offer.reviewMessageId) return false;
	try {
		const statusEmbed = buildStatusEmbed(offer, status, note);
		const userEmbed = getUserEmbedFromOffer(offer);

		await client.messages.edit(offer.reviewMessageId, offer.reviewChannelId, {
			embeds: [statusEmbed, userEmbed],
			components: [buildReviewButtons(offer.id, disableButtons)],
		});
		return true;
	} catch (error) {
		client.logger?.warn?.("[offers] no se pudo actualizar el mensaje de revisión", {
			error,
			guildId: offer.guildId,
			messageId: offer.reviewMessageId,
		});
		return false;
	}
}

async function publishOffer(
	client: UsingClient,
	offer: Offer,
	embed: Embed,
	approvedChannelId: string | null,
): Promise<{ publishedMessageId: string | null; publishedChannelId: string | null }> {
	if (!approvedChannelId) return { publishedChannelId: null, publishedMessageId: null };
	try {
		const message = await client.messages.write(approvedChannelId, {
			content: `<@${offer.authorId}> Nueva oferta aprobada`,
			embeds: [embed],
			allowed_mentions: { users: [offer.authorId] },
		});

		return { publishedChannelId: message.channelId, publishedMessageId: message.id };
	} catch (error) {
		client.logger?.warn?.("[offers] no se pudo publicar la oferta aprobada", {
			error,
			guildId: offer.guildId,
			offerId: offer.id,
		});
		return { publishedChannelId: null, publishedMessageId: null };
	}
}

async function notifyAuthor(
	client: UsingClient,
	offer: Offer,
	message: string,
): Promise<void> {
	try {
		await client.users.write(offer.authorId, {
			content: message,
			allowed_mentions: { parse: [] },
		});
	} catch (error) {
		client.logger?.debug?.("[offers] no se pudo notificar al autor por DM", {
			error,
			offerId: offer.id,
			authorId: offer.authorId,
		});
	}
}

export async function assertNoActiveOffer(
	guildId: string,
	authorId: string,
): Promise<Offer | null> {
	return findActiveByAuthor(guildId, authorId);
}

export async function getActiveOffer(
	guildId: string,
	authorId: string,
): Promise<Offer | null> {
	return findActiveByAuthor(guildId, authorId);
}

export async function createOfferForReview(
	client: UsingClient,
	params: {
		guildId: string;
		authorId: string;
		details: OfferDetails;
		authorTag: string;
		authorAvatar?: string;
		offerId?: string;
		userEmbed?: Embed;
	},
): Promise<Offer> {
	const existing = await findActiveByAuthor(params.guildId, params.authorId);
	if (existing) {
		throw new Error("ACTIVE_OFFER_EXISTS");
	}

	const { reviewChannelId } = await resolveChannels(params.guildId);
	if (!reviewChannelId) {
		await logModerationAction(client, params.guildId, {
			title: "Ofertas: canal de revisión no configurado",
			description:
				"No se pudo crear la oferta porque falta el canal `offersReview` en la configuración.",
			color: EmbedColors.Red,
		});
		client.logger?.error?.("[offers] missing offersReview channel", {
			guildId: params.guildId,
			authorId: params.authorId,
		});
		throw new Error("OFFERS_REVIEW_CHANNEL_MISSING");
	}

	const id = params.offerId ?? generateOfferId();
	const userEmbed =
		params.userEmbed ??
		buildOfferEmbed(params.details, {
			status: "PENDING_REVIEW",
			offerId: id,
			authorTag: params.authorTag,
			authorAvatar: params.authorAvatar,
			includeMeta: false,
		});
	const statusEmbed = buildStatusEmbed(
		{
			id,
			guildId: params.guildId,
			authorId: params.authorId,
			status: "PENDING_REVIEW",
			details: params.details,
			embed: userEmbed.toJSON(),
			reviewMessageId: null,
			reviewChannelId: null,
			publishedMessageId: null,
			publishedChannelId: null,
			rejectionReason: null,
			changesNote: null,
			lastModeratorId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		"PENDING_REVIEW",
		null,
	);

	const message = await client.messages.write(reviewChannelId, {
		content: `Nueva oferta enviada por <@${params.authorId}>`,
		embeds: [statusEmbed, userEmbed],
		components: [buildReviewButtons(id, false)],
		allowed_mentions: { users: [params.authorId] },
	});

	return createOffer({
		id,
		guildId: params.guildId,
		authorId: params.authorId,
		details: params.details,
		embed: userEmbed.toJSON(),
		reviewMessageId: message.id,
		reviewChannelId,
	});
}

export async function editOfferContent(
	client: UsingClient,
	offer: Offer,
	details: OfferDetails,
	userEmbed: Embed,
): Promise<Offer | null> {
	const updated = await updateOffer(offer.id, {
		details,
		status: "PENDING_REVIEW",
		embed: userEmbed.toJSON(),
		rejectionReason: null,
		changesNote: null,
	});

	if (updated) {
		await updateReviewMessage(
			client,
			{ ...offer, ...updated },
			"PENDING_REVIEW",
			"Actualizada por el autor",
			false,
		);
	}

	return updated;
}

export async function withdrawOffer(
	client: UsingClient,
	offer: Offer,
	actorId: string,
): Promise<Offer | null> {
	const updated = await transitionOffer(
		offer.id,
		"WITHDRAWN",
		ACTIVE_STATUSES,
		{ lastModeratorId: actorId },
	);

	if (updated) {
		await updateReviewMessage(
			client,
			{ ...offer, ...updated },
			"WITHDRAWN",
			"Retirada por el autor",
			true,
		);
	}

	return updated;
}

export async function approveOffer(
	client: UsingClient,
	offerId: string,
	moderatorId: string,
): Promise<Offer | null> {
	const offer = await findById(offerId);
	if (!offer) return null;

	const updated = await transitionOffer(
		offerId,
		"APPROVED",
		["PENDING_REVIEW"],
		{ lastModeratorId: moderatorId },
	);
	if (!updated) return null;

	const { approvedChannelId, generalLogsId } = await resolveChannels(updated.guildId);

	if (!approvedChannelId) {
		await logModerationAction(client, updated.guildId, {
			title: "Ofertas: canal de aprobadas no configurado",
			description:
				"La oferta no se pudo publicar porque falta el canal `approvedOffers` en la configuración.",
			color: EmbedColors.Red,
		});
	}

	const publishResult = await publishOffer(
		client,
		updated,
		buildOfferEmbed(updated.details, {
			status: "APPROVED",
			offerId: updated.id,
			authorTag: `<@${updated.authorId}>`,
			includeMeta: false,
			note: "Aprobada por moderación",
		}),
		approvedChannelId,
	);

	await updateOffer(updated.id, {
		publishedChannelId: publishResult.publishedChannelId ?? null,
		publishedMessageId: publishResult.publishedMessageId ?? null,
	});

	await updateReviewMessage(client, updated, "APPROVED", null, true);

	await notifyAuthor(
		client,
		updated,
		"Tu oferta fue aprobada y publicada en el canal configurado. ¡Gracias por compartir!",
	);

	if (generalLogsId) {
		await logModerationAction(client, updated.guildId, {
			title: "Oferta aprobada",
			description: `ID: \`${updated.id}\`\nAutor: <@${updated.authorId}>`,
			fields: [
				publishResult.publishedChannelId
					? { name: "Canal", value: `<#${publishResult.publishedChannelId}>`, inline: true }
					: { name: "Canal", value: "No configurado", inline: true },
			],
			actorId: moderatorId,
			color: EmbedColors.Green,
		});
	}

	return { ...updated, ...publishResult };
}

export async function rejectOffer(
	client: UsingClient,
	offerId: string,
	moderatorId: string,
	reason: string | null,
): Promise<Offer | null> {
	const offer = await findById(offerId);
	if (!offer) return null;

	const updated = await transitionOffer(
		offerId,
		"REJECTED",
		["PENDING_REVIEW", "CHANGES_REQUESTED"],
		{
			rejectionReason: reason ?? null,
			lastModeratorId: moderatorId,
		},
	);
	if (!updated) return null;

	await updateReviewMessage(client, updated, "REJECTED", reason ?? null, true);

	await notifyAuthor(
		client,
		updated,
		`Tu oferta fue rechazada.${reason ? ` Motivo: ${reason}` : ""}`,
	);

	await logModerationAction(client, updated.guildId, {
		title: "Oferta rechazada",
		description: `ID: \`${updated.id}\``,
		fields: [
			{ name: "Autor", value: `<@${updated.authorId}>`, inline: true },
			{ name: "Moderador", value: `<@${moderatorId}>`, inline: true },
			reason ? { name: "Motivo", value: reason, inline: false } : null,
		].filter(Boolean) as Array<{ name: string; value: string; inline?: boolean }>,
		actorId: moderatorId,
		color: EmbedColors.Red,
	});

	return updated;
}

export async function requestOfferChanges(
	client: UsingClient,
	offerId: string,
	moderatorId: string,
	note: string,
): Promise<Offer | null> {
	const offer = await findById(offerId);
	if (!offer) return null;

	const updated = await transitionOffer(
		offerId,
		"CHANGES_REQUESTED",
		["PENDING_REVIEW"],
		{
			changesNote: note,
			rejectionReason: null,
			lastModeratorId: moderatorId,
		},
	);
	if (!updated) return null;

	await updateReviewMessage(client, updated, "CHANGES_REQUESTED", note, false);

	await notifyAuthor(
		client,
		updated,
		`Se solicitaron cambios en tu oferta. Detalles: ${note}`,
	);

	await logModerationAction(client, updated.guildId, {
		title: "Cambios solicitados en oferta",
		description: `ID: \`${updated.id}\`\nAutor: <@${updated.authorId}>`,
		fields: [{ name: "Moderador", value: `<@${moderatorId}>`, inline: true }],
		actorId: moderatorId,
		color: EmbedColors.Orange,
	});

	return updated;
}
