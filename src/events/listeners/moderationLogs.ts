/**
 * Motivación: encapsular la reacción al evento "moderation Logs" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
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
import {
  onGuildMemberAdd,
  onGuildMemberRemove,
  onGuildMemberUpdate,
} from "@/events/hooks/guildMember";
import {
  onGuildRoleCreate,
  onGuildRoleDelete,
  onGuildRoleUpdate,
} from "@/events/hooks/guildRole";
import { onGuildBanAdd, onGuildBanRemove } from "@/events/hooks/guildBan";
import { onInviteDelete } from "@/events/hooks/inviteEvents";
import { logModerationAction } from "@/utils/moderationLogger";

const asUserTag = (userId: string | null | undefined): string =>
  userId ? `<@${userId}>` : "Usuario desconocido";

const formatTimestampNow = (): string => `<t:${Math.floor(Date.now() / 1000)}:f>`;

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
  const wasPinned = Boolean(oldMessage?.pinned);
  const isPinned = Boolean(newMessage?.pinned);

  if (before !== after) {
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
  }

  if (wasPinned !== isPinned) {
    await logModerationAction(client, guildId, {
      title: isPinned ? "Mensaje pineado" : "Mensaje despineado",
      description: [
        `Canal: <#${channelId}>`,
        `Mensaje: ${newMessage?.id ?? oldMessage?.id ?? "desconocido"}`,
        authorId ? `Autor: <@${authorId}>` : "Autor desconocido",
      ].join("\n"),
      color: isPinned ? EmbedColors.Green : EmbedColors.Red,
    });
  }
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
  const beforeSlowmode = oldChannel?.rateLimitPerUser;
  const afterSlowmode = newChannel?.rateLimitPerUser;
  const beforeNSFW = Boolean(oldChannel?.nsfw);
  const afterNSFW = Boolean(newChannel?.nsfw);

  if (beforeName !== afterName) {
    await logModerationAction(
      client,
      guildId,
      {
        title: "Canal renombrado",
        description: `\`${beforeName}\` -> \`${afterName}\``,
        color: EmbedColors.Blurple,
      },
    );
  }

  if (beforeSlowmode !== afterSlowmode) {
    await logModerationAction(client, guildId, {
      title: "Slowmode actualizado",
      description: [
        `Canal: <#${newChannel?.id ?? oldChannel?.id}>`,
        `Anterior: ${beforeSlowmode ?? 0}s`,
        `Nuevo: ${afterSlowmode ?? 0}s`,
      ].join("\n"),
      color: EmbedColors.Yellow,
    });
  }

  if (beforeNSFW !== afterNSFW) {
    await logModerationAction(client, guildId, {
      title: "NSFW actualizado",
      description: [
        `Canal: <#${newChannel?.id ?? oldChannel?.id}>`,
        beforeNSFW
          ? "Se desactivo la marca NSFW"
          : "Se activo la marca NSFW",
      ].join("\n"),
      color: afterNSFW ? EmbedColors.Red : EmbedColors.Green,
    });
  }

  const beforePermissions = JSON.stringify(oldChannel?.permissionOverwrites ?? []);
  const afterPermissions = JSON.stringify(newChannel?.permissionOverwrites ?? []);
  if (beforePermissions !== afterPermissions) {
    await logModerationAction(client, guildId, {
      title: "Permisos del canal actualizados",
      description: `Canal: <#${newChannel?.id ?? oldChannel?.id}>`,
      color: EmbedColors.Blurple,
    });
  }
});

onGuildMemberAdd(async (...args: any[]) => {
  const [member, client] = args;
  const guildId = member?.guildId;
  if (!guildId) return;

  const userId = member?.user?.id ?? member?.id ?? null;
  const joinedAt = member?.joinedAt ? `<t:${Math.floor(new Date(member.joinedAt).getTime() / 1000)}:f>` : formatTimestampNow();

  await logModerationAction(client, guildId, {
    title: "Miembro se unio",
    description: [
      `Usuario: ${asUserTag(userId)}`,
      `Ingreso: ${joinedAt}`,
    ].join("\n"),
    color: EmbedColors.Green,
  });
});

onGuildMemberRemove(async (...args: any[]) => {
  const [member, client] = args;
  const guildId = member?.guildId ?? member?.guild?.id;
  if (!guildId) return;

  const userId = member?.user?.id ?? member?.id ?? null;

  await logModerationAction(client, guildId, {
    title: "Miembro salio o fue expulsado",
    description: [
      `Usuario: ${asUserTag(userId)}`,
      `Momento: ${formatTimestampNow()}`,
    ].join("\n"),
    color: EmbedColors.Red,
  });
});

onGuildBanAdd(async (...args: any[]) => {
  const [ban, client] = args;
  const guildId = (ban as any)?.guildId ?? (ban as any)?.guild?.id;
  if (!guildId) return;

  const userId = (ban as any)?.user?.id ?? null;

  await logModerationAction(client, guildId, {
    title: "Usuario baneado",
    description: [
      `Usuario: ${asUserTag(userId)}`,
      `Motivo: ${(ban as any)?.reason ?? "No especificado"}`,
    ].join("\n"),
    color: EmbedColors.Red,
  });
});

onGuildBanRemove(async (...args: any[]) => {
  const [ban, client] = args;
  const guildId = (ban as any)?.guildId ?? (ban as any)?.guild?.id;
  if (!guildId) return;

  const userId = (ban as any)?.user?.id ?? null;

  await logModerationAction(client, guildId, {
    title: "Usuario desbaneado",
    description: [
      `Usuario: ${asUserTag(userId)}`,
      `Momento: ${formatTimestampNow()}`,
    ].join("\n"),
    color: EmbedColors.Green,
  });
});

const extractRoleIds = (member: any): string[] => {
  if (!member) return [];
  if (Array.isArray(member.roles)) return member.roles;
  if (member.roles?.cache) return Array.from(member.roles.cache.keys?.() ?? []);
  return member.roleIds ?? [];
};

const renderRoleList = (roles: string[]): string =>
  roles.length ? roles.map((id) => `<@&${id}>`).join(", ") : "Sin roles";

onGuildMemberUpdate(async (...args: any[]) => {
  const [oldMember, newMember, client] = args;
  const guildId = newMember?.guildId ?? oldMember?.guildId;
  if (!guildId) return;

  const userId = newMember?.user?.id ?? oldMember?.user?.id ?? null;

  const oldRoles = new Set(extractRoleIds(oldMember));
  const newRoles = new Set(extractRoleIds(newMember));

  const addedRoles: string[] = [];
  const removedRoles: string[] = [];

  for (const role of newRoles) {
    if (!oldRoles.has(role)) addedRoles.push(role);
  }
  for (const role of oldRoles) {
    if (!newRoles.has(role)) removedRoles.push(role);
  }

  if (addedRoles.length || removedRoles.length) {
    await logModerationAction(client, guildId, {
      title: "Roles actualizados",
      description: [
        `Usuario: ${asUserTag(userId)}`,
        addedRoles.length ? `Agregados: ${renderRoleList(addedRoles)}` : null,
        removedRoles.length ? `Removidos: ${renderRoleList(removedRoles)}` : null,
      ].filter(Boolean).join("\n"),
      color: EmbedColors.Blurple,
    });
  }

  const oldNick = oldMember?.nickname ?? oldMember?.nick ?? null;
  const newNick = newMember?.nickname ?? newMember?.nick ?? null;
  if (oldNick !== newNick) {
    await logModerationAction(client, guildId, {
      title: "Apodo actualizado",
      description: [
        `Usuario: ${asUserTag(userId)}`,
        `Antes: ${oldNick ?? "Sin apodo"}`,
        `Despues: ${newNick ?? "Sin apodo"}`,
      ].join("\n"),
      color: EmbedColors.Yellow,
    });
  }

  const oldTimeout = (oldMember as any)?.communicationDisabledUntilTimestamp
    ?? (oldMember as any)?.communicationDisabledUntil;
  const newTimeout = (newMember as any)?.communicationDisabledUntilTimestamp
    ?? (newMember as any)?.communicationDisabledUntil;

  if (oldTimeout !== newTimeout) {
    const toUnix = (value: any): number | null => {
      if (!value) return null;
      if (typeof value === "number") return Math.floor(value / 1000);
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
    };
    const until = toUnix(newTimeout);
    await logModerationAction(client, guildId, {
      title: until ? "Usuario en timeout" : "Timeout removido",
      description: [
        `Usuario: ${asUserTag(userId)}`,
        until ? `Expira: <t:${until}:R>` : "Se eliminó la restriccion",
      ].join("\n"),
      color: until ? EmbedColors.Red : EmbedColors.Green,
    });
  }
});

onGuildRoleCreate(async (...args: any[]) => {
  const [role, client] = args;
  const guildId = role?.guildId ?? role?.guild?.id;
  if (!guildId) return;

  await logModerationAction(client, guildId, {
    title: "Rol creado",
    description: [
      `Nombre: ${role?.name ?? "Desconocido"}`,
      `Rol: ${role?.id ? `<@&${role.id}>` : "Sin ID"}`,
    ].join("\n"),
    color: EmbedColors.Green,
  });
});

onGuildRoleUpdate(async (...args: any[]) => {
  const [oldRole, newRole, client] = args;
  const guildId = newRole?.guildId ?? oldRole?.guildId;
  if (!guildId) return;

  const changes: string[] = [];
  if (oldRole?.name !== newRole?.name) {
    changes.push(`Nombre: \`${oldRole?.name ?? "?"}\` -> \`${newRole?.name ?? "?"}\``);
  }
  if (oldRole?.color !== newRole?.color) {
    changes.push(`Color: ${oldRole?.color ?? "sin color"} -> ${newRole?.color ?? "sin color"}`);
  }
  const beforePerms = (oldRole?.permissions as any)?.bitfield ?? (oldRole?.permissions as any)?.bitField ?? oldRole?.permissions;
  const afterPerms = (newRole?.permissions as any)?.bitfield ?? (newRole?.permissions as any)?.bitField ?? newRole?.permissions;
  if (beforePerms !== afterPerms) {
    changes.push("Permisos actualizados");
  }

  if (changes.length === 0) return;

  await logModerationAction(client, guildId, {
    title: "Rol actualizado",
    description: [
      `Rol: ${newRole?.id ? `<@&${newRole.id}>` : "Desconocido"}`,
      ...changes,
    ].join("\n"),
    color: EmbedColors.Yellow,
  });
});

onGuildRoleDelete(async (...args: any[]) => {
  const [role, client] = args;
  const guildId = role?.guildId ?? role?.guild?.id;
  if (!guildId) return;

  await logModerationAction(client, guildId, {
    title: "Rol eliminado",
    description: [
      `Nombre: ${role?.name ?? "Desconocido"}`,
      `ID: ${role?.id ?? "Sin ID"}`,
    ].join("\n"),
    color: EmbedColors.Red,
  });
});

onInviteDelete(async (...args: any[]) => {
  const [invite, client] = args;
  const guildId = (invite as any)?.guildId ?? (invite as any)?.guild?.id;
  if (!guildId) return;

  const code = (invite as any)?.code ?? "desconocida";
  const channelId = (invite as any)?.channelId ?? (invite as any)?.channel?.id ?? null;

  await logModerationAction(client, guildId, {
    title: "Invitacion eliminada o expirada",
    description: [
      `Invitacion: ${code}`,
      channelId ? `Canal: <#${channelId}>` : "Canal desconocido",
    ].join("\n"),
    color: EmbedColors.Red,
  });
});
