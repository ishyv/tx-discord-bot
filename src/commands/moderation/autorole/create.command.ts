/**
 * Autorole Create Command
 */
import {
  createRoleOption,
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";
import { PermissionFlagsBits } from "seyfert/lib/types";

import {
  AutoroleService,
  isValidRuleSlug,
  normalizeRuleSlug,
  parseDuration as parseDurationInput,
  parseTrigger,
  refreshGuildRules,
} from "@/modules/autorole";
import type {
  AutoRoleRule,
  AutoRoleTrigger,
} from "@/modules/autorole/domain/types";
import { logModerationAction } from "@/utils/moderationLogger";

import {
  botCanManageRole,
  formatRuleSummary,
  requireAutoroleContext,
} from "./shared";

const options = {
  name: createStringOption({
    description: "Slug del rule (minusculas, 1-40 caracteres)",
    required: true,
  }),
  trigger: createStringOption({
    description: "Definicion del trigger (ej. `onReact <messageId> <:emoji:>`)",
    required: true,
  }),
  role: createRoleOption({
    description: "Rol a otorgar cuando se cumpla el trigger",
    required: true,
  }),
  duration: createStringOption({
    description: "Duracion (ej. 30m, 1h, 2d). Vacio = permanente",
    required: false,
  }),
};

const DANGEROUS_ROLE_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
] as const;

@Declare({
  name: "create",
  description: "Crear una nueva regla de auto-role",
})
@Options(options)
export default class AutoroleCreateCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const existingRules = await refreshGuildRules(context.guildId);

    const rawSlug = ctx.options.name.trim();
    if (!isValidRuleSlug(rawSlug)) {
      await ctx.write({
        content:
          "El nombre debe usar `a-z`, `0-9` o guiones, y tener entre 1 y 40 caracteres.",
      });
      return;
    }
    const slug = normalizeRuleSlug(rawSlug);

    const nameCollision = existingRules.find((rule) => rule.name === slug);
    if (nameCollision) {
      await ctx.write({
        content: `Ya existe una regla llamada \`${slug}\` en este servidor.`,
      });
      return;
    }

    const trigger = parseTrigger(ctx.options.trigger);
    if (!trigger) {
      await ctx.write({
        content: "Trigger invalido. Verifica el formato y vuelve a intentar.",
      });
      return;
    }

    const roleId = ctx.options.role.id;
    if (ctx.options.role.permissions?.has?.([...DANGEROUS_ROLE_PERMISSIONS])) {
      await ctx.write({
        content:
          "No puedes crear una regla que otorgue un rol con permisos administrativos (Administrator / ManageGuild / ManageRoles).",
      });
      return;
    }

    const invokerCanManage = await userCanManageTargetRole(
      ctx,
      context.guildId,
      roleId,
    );
    if (!invokerCanManage) {
      await ctx.write({
        content:
          "No puedes asignar reglas para un rol igual o superior a tu jerarquía actual.",
      });
      return;
    }

    const manageable = await botCanManageRole(ctx, roleId);
    if (!manageable) {
      await ctx.write({
        content:
          "No puedo administrar ese rol. Asegurate de que este debajo del rol del bot y que el bot tenga permisos de ManageRoles.",
      });
      return;
    }

    const rawDuration = ctx.options.duration?.trim();
    const durationMs = rawDuration ? parseDurationInput(rawDuration) : null;
    if (rawDuration && durationMs == null) {
      await ctx.write({
        content: "La duracion debe usar formatos como `30m`, `1h`, `2d`, `1w`.",
      });
      return;
    }

    const preflightError = await validateTriggerInput(
      ctx,
      context.guildId,
      trigger,
      existingRules,
    );
    if (preflightError) {
      await ctx.write({ content: preflightError });
      return;
    }

    const rule = await AutoroleService.createRule({
      guildId: context.guildId,
      name: slug,
      trigger,
      roleId,
      durationMs,
      enabled: true,
      createdBy: ctx.author.id,
    });

    if (rule.trigger.type === "ANTIQUITY_THRESHOLD" && rule.enabled) {
      // Aplicar el rol a miembros existentes que cumplan la antigüedad
      // En una implementación real, esto podría ser pesado, así que se hace asíncrono
      ctx.client.members
        .list(context.guildId)
        .then(async (members) => {
          for (const member of members) {
            await AutoroleService.syncUserAntiquityRoles(
              ctx.client,
              context.guildId,
              {
                id: member.id,
                joinedAt: member.joinedAt,
              },
            );
          }
        })
        .catch((e) =>
          ctx.client.logger?.error?.(
            "[autorole] initial antiquity sync failed",
            e,
          ),
        );
    }

    const embed = new Embed({
      title: "Regla creada",
      color: EmbedColors.Green,
      description: formatRuleSummary(rule),
    });

    await ctx.write({ embeds: [embed] });

    await logModerationAction(ctx.client, context.guildId, {
      title: "Autorole creado",
      description: formatRuleSummary(rule),
      fields: [
        { name: "Trigger", value: `\`${ctx.options.trigger}\`` },
        { name: "Rol", value: `<@&${roleId}>`, inline: true },
      ],
      actorId: ctx.author.id,
    });
  }
}

async function validateTriggerInput(
  ctx: GuildCommandContext,
  guildId: string,
  trigger: AutoRoleTrigger,
  existingRules: AutoRoleRule[],
): Promise<string | null> {
  if (trigger.type === "REACT_SPECIFIC") {
    const { messageId, emojiKey } = trigger.args;

    const duplicate = existingRules.find(
      (rule) =>
        rule.trigger.type === "REACT_SPECIFIC" &&
        rule.trigger.args.messageId === messageId &&
        rule.trigger.args.emojiKey === emojiKey,
    );
    if (duplicate) {
      return `Ya existe la regla \`${duplicate.name}\` usando ese mensaje y emoji.`;
    }

    const emojiError = await ensureEmojiIsUsable(ctx, guildId, emojiKey);
    if (emojiError) return emojiError;
  } else if (trigger.type === "REACTED_THRESHOLD") {
    const emojiError = await ensureEmojiIsUsable(
      ctx,
      guildId,
      trigger.args.emojiKey,
    );
    if (emojiError) return emojiError;
  } else if (trigger.type === "REPUTATION_THRESHOLD") {
    const duplicate = existingRules.find(
      (rule) =>
        rule.trigger.type === "REPUTATION_THRESHOLD" &&
        rule.trigger.args.minRep === trigger.args.minRep,
    );
    if (duplicate) {
      return `Ya existe la regla \`${duplicate.name}\` para rep >= ${trigger.args.minRep}.`;
    }
  }

  return null;
}

async function ensureEmojiIsUsable(
  ctx: GuildCommandContext,
  guildId: string,
  emojiKey: string,
): Promise<string | null> {
  if (!isCustomEmojiKey(emojiKey)) return null;

  try {
    const guild = await ctx.client.guilds.fetch(guildId);
    const emojis = await guild.emojis.list(true);
    const found = emojis.some((emoji) => emoji.id === emojiKey);
    if (!found) {
      return "El emoji indicado no pertenece a este servidor o ya no existe.";
    }
  } catch (error) {
    ctx.client.logger?.warn?.("[autorole] no se pudo validar el emoji", {
      guildId,
      emojiKey,
      error,
    });
    return "No se pudo validar el emoji indicado. Verifica que el bot tenga permiso para ver los emojis del servidor.";
  }

  return null;
}

function isCustomEmojiKey(key: string): boolean {
  return /^\d{16,}$/.test(key);
}

async function userCanManageTargetRole(
  ctx: GuildCommandContext,
  guildId: string,
  roleId: string,
): Promise<boolean> {
  try {
    const guild = await ctx.client.guilds.fetch(guildId);
    const roles = await guild.roles.list(true);
    const target = roles.find((role) => role.id === roleId);
    if (!target) return false;

    const member = await guild.members
      .fetch(ctx.author.id, true)
      .catch(() => null);
    if (!member) return false;

    const highest = await member.roles.highest(true).catch(() => null);
    if (!highest) return false;

    return highest.position > target.position;
  } catch (error) {
    ctx.client.logger?.warn?.(
      "[autorole] no se pudo validar jerarquia del usuario",
      {
        guildId,
        roleId,
        error,
      },
    );
    return false;
  }
}
