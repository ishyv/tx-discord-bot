/**
 * Motivación: estructurar el módulo offers (service) en piezas reutilizables y autocontenidas.
 *
 * Idea/concepto: agrupa helpers y orquestadores bajo un mismo dominio para evitar acoplamientos dispersos.
 *
 * Alcance: soporte de dominio; no sustituye a los comandos o servicios que consumen el módulo.
 */
import { randomBytes } from "node:crypto";
import { type Embed, type UsingClient } from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import {
	createOffer,
	findActiveByAuthor,
	findById,
	updateOffer,
} from "@/db/repositories/offers";
import { getGuildChannels } from "@/modules/guild-channels";
import { logModerationAction } from "@/utils/moderationLogger";
import { type Result, OkResult, ErrResult } from "@/utils/result";
import {
	buildOfferEmbed,
	buildReviewButtons,
	buildStatusEmbed,
	getUserEmbedFromOffer,
} from "./embeds";
import {
	ACTIVE_STATUSES,
	type Offer,
	type OfferDetails,
	type OfferStatus,
} from "./types";

export { ACTIVE_STATUSES };

/** Genera un ID corto y legible para la oferta. */
export function generateOfferId(): string {
	return randomBytes(5).toString("hex");
}

async function applyStatus(
	offerId: string,
	status: OfferStatus,
	allowedFrom: OfferStatus[],
	patch: Partial<Offer> = {},
) {
	return updateOffer(offerId, { ...patch, status }, { allowedFrom });
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
): Promise<Result<boolean>> {
	if (!offer.reviewChannelId || !offer.reviewMessageId) return OkResult(false);
	try {
		const statusEmbed = buildStatusEmbed(offer, status, note);
		const userEmbed = getUserEmbedFromOffer(offer);

		await client.messages.edit(offer.reviewMessageId, offer.reviewChannelId, {
			embeds: [statusEmbed, userEmbed],
			components: [buildReviewButtons(offer.id, disableButtons)],
		});
		return OkResult(true);
	} catch (error) {
		client.logger?.warn?.("[offers] no se pudo actualizar el mensaje de revisión", {
			error,
			guildId: offer.guildId,
			messageId: offer.reviewMessageId,
		});
		// No fallamos la operación completa si solo falla la UI
		return OkResult(false);
	}
}

async function publishOffer(
	client: UsingClient,
	offer: Offer,
	embed: Embed,
	approvedChannelId: string | null,
): Promise<Result<{ publishedMessageId: string | null; publishedChannelId: string | null }>> {
	if (!approvedChannelId) return OkResult({ publishedChannelId: null, publishedMessageId: null });
	try {
		const message = await client.messages.write(approvedChannelId, {
			content: `<@${offer.authorId}> Nueva oferta aprobada`,
			embeds: [embed],
			allowed_mentions: { users: [offer.authorId] },
		});

		return OkResult({ publishedChannelId: message.channelId, publishedMessageId: message.id });
	} catch (error) {
		client.logger?.warn?.("[offers] no se pudo publicar la oferta aprobada", {
			error,
			guildId: offer.guildId,
			offerId: offer.id,
		});
		return ErrResult(error instanceof Error ? error : new Error(String(error)));
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
): Promise<Result<Offer | null>> {
	return findActiveByAuthor(guildId, authorId);
}

export async function getActiveOffer(
	guildId: string,
	authorId: string,
): Promise<Result<Offer | null>> {
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
): Promise<Result<Offer>> {
	const existingResult = await findActiveByAuthor(params.guildId, params.authorId);
	if (existingResult.isErr()) return ErrResult(existingResult.error);

	if (existingResult.unwrap()) {
		return ErrResult(new Error("ACTIVE_OFFER_EXISTS"));
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
		return ErrResult(new Error("OFFERS_REVIEW_CHANNEL_MISSING"));
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
			details: params.details as any,
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
		} as unknown as Offer,
		"PENDING_REVIEW",
		null,
	);

	try {
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
	} catch (error) {
		return ErrResult(error instanceof Error ? error : new Error(String(error)));
	}
}

export async function editOfferContent(
	client: UsingClient,
	offer: Offer,
	details: OfferDetails,
	userEmbed: Embed,
): Promise<Result<Offer | null>> {
	const updatedResult = await updateOffer(offer.id, {
		details,
		status: "PENDING_REVIEW",
		embed: userEmbed.toJSON(),
		rejectionReason: null,
		changesNote: null,
	});

	if (updatedResult.isErr()) return updatedResult;
	const updated = updatedResult.unwrap();

	if (updated) {
		await updateReviewMessage(
			client,
			{ ...offer, ...updated },
			"PENDING_REVIEW",
			"Actualizada por el autor",
			false,
		);
	}

	return OkResult(updated);
}

export async function withdrawOffer(
	client: UsingClient,
	offer: Offer,
	actorId: string,
): Promise<Result<Offer | null>> {
	const updatedResult = await applyStatus(offer.id, "WITHDRAWN", ACTIVE_STATUSES, {
		lastModeratorId: actorId,
	});

	if (updatedResult.isErr()) return updatedResult;
	const updated = updatedResult.unwrap();

	if (updated) {
		await updateReviewMessage(
			client,
			{ ...offer, ...updated },
			"WITHDRAWN",
			"Retirada por el autor",
			true,
		);
	}

	return OkResult(updated);
}

export async function approveOffer(
	client: UsingClient,
	offerId: string,
	moderatorId: string,
): Promise<Result<Offer | null>> {
	const offerResult = await findById(offerId);
	if (offerResult.isErr()) return ErrResult(offerResult.error);
	const offer = offerResult.unwrap();

	if (!offer) return OkResult(null);

	const updatedResult = await applyStatus(offerId, "APPROVED", ["PENDING_REVIEW"], {
		lastModeratorId: moderatorId,
	});
	if (updatedResult.isErr()) return updatedResult;
	const updated = updatedResult.unwrap();

	if (!updated) return OkResult(null);

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

	// Si falla la publicación, no fallamos toda la operación, pero logueamos?
	// publishOffer ya devuelve Result.
	const publishData = publishResult.unwrapOr({ publishedChannelId: null, publishedMessageId: null });

	await updateOffer(updated.id, {
		publishedChannelId: publishData.publishedChannelId ?? null,
		publishedMessageId: publishData.publishedMessageId ?? null,
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
				publishData.publishedChannelId
					? { name: "Canal", value: `<#${publishData.publishedChannelId}>`, inline: true }
					: { name: "Canal", value: "No configurado", inline: true },
			],
			actorId: moderatorId,
			color: EmbedColors.Green,
		});
	}

	return OkResult({ ...updated, ...publishData });
}

export async function rejectOffer(
	client: UsingClient,
	offerId: string,
	moderatorId: string,
	reason: string | null,
): Promise<Result<Offer | null>> {
	const offerResult = await findById(offerId);
	if (offerResult.isErr()) return ErrResult(offerResult.error);
	const offer = offerResult.unwrap();

	if (!offer) return OkResult(null);

	const updatedResult = await applyStatus(
		offerId,
		"REJECTED",
		["PENDING_REVIEW", "CHANGES_REQUESTED"],
		{
			rejectionReason: reason ?? null,
			lastModeratorId: moderatorId,
		},
	);
	if (updatedResult.isErr()) return updatedResult;
	const updated = updatedResult.unwrap();

	if (!updated) return OkResult(null);

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

	return OkResult(updated);
}

export async function requestOfferChanges(
	client: UsingClient,
	offerId: string,
	moderatorId: string,
	note: string,
): Promise<Result<Offer | null>> {
	const offerResult = await findById(offerId);
	if (offerResult.isErr()) return ErrResult(offerResult.error);
	const offer = offerResult.unwrap();

	if (!offer) return OkResult(null);

	const updatedResult = await applyStatus(
		offerId,
		"CHANGES_REQUESTED",
		["PENDING_REVIEW"],
		{
			changesNote: note,
			rejectionReason: null,
			lastModeratorId: moderatorId,
		},
	);
	if (updatedResult.isErr()) return updatedResult;
	const updated = updatedResult.unwrap();

	if (!updated) return OkResult(null);

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

	return OkResult(updated);
}
