/**
 * Configuración de canales para el sistema de ofertas.
 *
 * Este comando actualiza `channels.core` vía `configStore`:
 * - `offersReview`: canal donde se envían ofertas a revisión (obligatorio).
 * - `approvedOffers`: canal donde se publican ofertas aprobadas (opcional en el sistema, pero recomendado).
 */
import "./config";

import { createChannelOption, Declare, Options, SubCommand, type GuildCommandContext } from "seyfert";
import { ChannelType, MessageFlags } from "seyfert/lib/types";

import { ensureGuild } from "@/db/repositories/with_guild";
import { ensureGuildContext } from "./shared";

const options = {
  revision: createChannelOption({
    description: "Canal donde se enviarán las ofertas para revisión",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),
  aprobadas: createChannelOption({
    description: "Canal donde se publicarán las ofertas aprobadas",
    required: true,
    channel_types: [ChannelType.GuildText],
  }),
};

@Declare({
  name: "config",
  description: "Configurar el sistema de ofertas",
  defaultMemberPermissions: ["ManageChannels"],
})
@Options(options)
export default class OfferConfigCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const guildId = await ensureGuildContext(ctx);
    if (!guildId) return;

    const { revision, aprobadas } = ctx.options;

    // Asegura el documento del guild para persistir `channels.core`.
    await ensureGuild(guildId);

    const { configStore, ConfigurableModule } = await import("@/configuration");
    await configStore.set(guildId, ConfigurableModule.Offers, {
      offersReview: { channelId: revision.id },
      approvedOffers: { channelId: aprobadas.id },
    });

    await ctx.write({
      content: [
        "Configuración de ofertas guardada:",
        `- Revisión: <#${revision.id}>`,
        `- Aprobadas: <#${aprobadas.id}>`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  }
}
