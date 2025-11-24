import { EmbedColors } from "seyfert/lib/common";

import {
  onMessageDelete,
  onMessageDeleteBulk,
} from "@/events/hooks/messageDelete";
import { onMessageUpdate } from "@/events/hooks/messageUpdate";
import {
  onChannelCreate,
  onChannelDelete,
  onChannelUpdate,
} from "@/events/hooks/channelEvents";
import { logModerationAction } from "@/utils/moderationLogger";

onMessageDelete(async (payload, client) => {
  const guildId = (payload as any).guildId ?? (payload as any).guild_id;
  const channelId = (payload as any).channelId ?? (payload as any).channel_id;
  if (!guildId || !channelId) return;

  const content = (payload as any).content ?? "[contenido no disponible]";
  const authorId = (payload as any).author?.id ?? null;

  await logModerationAction(
    client,
    guildId,
    {
      title: "Mensaje eliminado",
      description: [
        `Canal: <#${channelId}>`,
        authorId ? `Autor: <@${authorId}>` : "Autor desconocido",
        "",
        content ? `Contenido:\n${content}` : "Sin contenido registrado.",
      ].join("\n"),
      color: EmbedColors.Red,
    },
    "messageLogs",
  );
});

onMessageDeleteBulk(async (payload, client) => {
  const raw: any = payload;
  const guildId = raw.guildId ?? raw.guild_id;
  const channelId = raw.channelId ?? raw.channel_id;
  if (!guildId || !channelId) return;

  const count = Array.isArray(raw.ids) ? raw.ids.length : 0;

  await logModerationAction(
    client,
    guildId,
    {
      title: "Mensajes eliminados masivamente",
      description: `Se eliminaron ${count} mensajes en <#${channelId}>.`,
      color: EmbedColors.Red,
    },
    "messageLogs",
  );
});

onMessageUpdate(async (...args: any[]) => {
  const [oldMessage, newMessage, client] = args;
  const guildId = newMessage?.guildId ?? oldMessage?.guildId;
  const channelId = newMessage?.channelId ?? oldMessage?.channelId;
  if (!guildId || !channelId) return;

  const authorId = newMessage?.author?.id ?? oldMessage?.author?.id ?? null;
  const before = oldMessage?.content ?? "";
  const after = newMessage?.content ?? "";
  if (before === after) return;

  await logModerationAction(
    client,
    guildId,
    {
      title: "Mensaje editado",
      description: [
        `Canal: <#${channelId}>`,
        authorId ? `Autor: <@${authorId}>` : "Autor desconocido",
        "",
        `**Antes:**\n${before || "_vacio_"}`,
        "",
        `**Despues:**\n${after || "_vacio_"}`,
      ].join("\n"),
      color: EmbedColors.Yellow,
    },
    "messageLogs",
  );
});

onChannelCreate(async (...args: any[]) => {
  const [channel, client] = args;
  const guildId = channel?.guildId;
  if (!guildId) return;

  await logModerationAction(
    client,
    guildId,
    {
      title: "Canal creado",
      description: `Se creó el canal \`${channel?.name ?? channel?.id}\` (<#${channel?.id}>)`,
      color: EmbedColors.Green,
    },
  );
});

onChannelDelete(async (...args: any[]) => {
  const [channel, client] = args;
  const guildId = channel?.guildId;
  if (!guildId) return;

  await logModerationAction(
    client,
    guildId,
    {
      title: "Canal eliminado",
      description: `Se eliminó el canal \`${channel?.name ?? channel?.id}\`.`,
      color: EmbedColors.Red,
    },
  );
});

onChannelUpdate(async (...args: any[]) => {
  const [oldChannel, newChannel, client] = args;
  const guildId = newChannel?.guildId ?? oldChannel?.guildId;
  if (!guildId) return;

  const beforeName = oldChannel?.name ?? "desconocido";
  const afterName = newChannel?.name ?? "desconocido";
  if (beforeName === afterName) return;

  await logModerationAction(
    client,
    guildId,
    {
      title: "Canal renombrado",
      description: `\`${beforeName}\` -> \`${afterName}\``,
      color: EmbedColors.Blurple,
    },
  );
});
