/**
 * Autorole Purge Buttons Component
 */
import {
  ActionRow,
  Button,
  ComponentCommand,
  Embed,
  type ComponentContext,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import {
  AutoroleService,
  clearPurgeSession,
  getPurgeSession,
  type PurgeSession,
} from "@/modules/autorole";
import { logModerationAction } from "@/utils/moderationLogger";

const ID_PREFIX = "autorole:purge:";

export default class AutorolePurgeButtons extends ComponentCommand {
  componentType = "Button" as const;

  filter(ctx: ComponentContext<"Button">) {
    return ctx.customId.startsWith(ID_PREFIX);
  }

  async run(ctx: ComponentContext<"Button">) {
    if (!ctx.guildId) return;

    const parts = ctx.customId.split(":");
    const action = parts[2];
    const slug = parts[3];

    if (!action || !slug) {
      await ctx.write({
        content: "This action is no longer valid.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const messageId = ctx.interaction.message?.id;
    if (!messageId) {
      await ctx.write({
        content: "Could not resolve the message for this action.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const session = getPurgeSession(messageId);
    if (!session) {
      await ctx.write({
        content: "This action expired. Run the command again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (Date.now() > session.expiresAt) {
      clearPurgeSession(messageId);
      await disableWithStatus(ctx, slug, "Expired");
      return;
    }

    const hasPermission =
      ctx.author.id === session.invokerId ||
      ctx.member?.permissions?.has?.(["ManageRoles"]) === true;

    if (!hasPermission) {
      await ctx.write({
        content: "You need ManageRoles permission or be the original requester.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    switch (action) {
      case "confirm":
        await this.handleConfirm(ctx, session, messageId);
        break;
      case "cancel":
        await this.handleCancel(ctx, slug, messageId);
        break;
      default:
        await ctx.write({
          content: "Unknown action.",
          flags: MessageFlags.Ephemeral,
        });
    }
  }

  private async handleConfirm(
    ctx: ComponentContext<"Button">,
    session: PurgeSession,
    messageId: string,
  ) {
    await ctx.deferUpdate();

    const result = await AutoroleService.purgeRule(
      ctx.client,
      session.guildId,
      session.slug,
    );

    clearPurgeSession(messageId);

    ctx.client.logger?.info?.("[autorole] rule purged via button", {
      guildId: session.guildId,
      ruleName: session.slug,
      actorId: ctx.author.id,
      removedGrants: result.removedGrants,
      roleRevocations: result.roleRevocations,
    });

    await logModerationAction(ctx.client, session.guildId, {
      title: "Autorole Purged",
      description: `Rule \`${session.slug}\` purged`,
      fields: [
        {
          name: "Grants removed",
          value: `${result.removedGrants}`,
          inline: true,
        },
        {
          name: "Roles revoked",
          value: `${result.roleRevocations}`,
          inline: true,
        },
      ],
      actorId: ctx.author.id,
    });

    try {
      const resp = await ctx.fetchResponse();
      const baseEmbed = resp.embeds?.[0];
      const embed = new Embed(baseEmbed);
      embed.setFooter({
        text: `Purged: removed ${result.removedGrants} grants, revoked ${result.roleRevocations} roles.`,
      });

      await ctx.editResponse({
        embeds: [embed],
        components: [buildDisabledRow(session.slug)],
      });
    } catch (error) {
      ctx.client.logger?.warn?.("[autorole] failed to update purge embed", {
        error,
        guildId: session.guildId,
      });
    }
  }

  private async handleCancel(
    ctx: ComponentContext<"Button">,
    slug: string,
    messageId: string,
  ) {
    await ctx.deferUpdate();
    clearPurgeSession(messageId);
    await disableWithStatus(ctx, slug, "Canceled");
  }
}

async function disableWithStatus(
  ctx: ComponentContext<"Button">,
  slug: string,
  status: string,
) {
  const resp = await ctx.fetchResponse();
  const baseEmbed = resp.embeds?.[0];
  const embed = new Embed(baseEmbed);
  embed.setFooter({ text: status });

  await ctx.editResponse({
    embeds: [embed],
    components: [buildDisabledRow(slug)],
  });
}

function buildDisabledRow(slug: string) {
  const confirm = new Button()
    .setCustomId(`autorole:purge:confirm:${slug}`)
    .setLabel("Confirm Purge")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);
  const cancel = new Button()
    .setCustomId(`autorole:purge:cancel:${slug}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  return new ActionRow<Button>().addComponents(confirm, cancel);
}
