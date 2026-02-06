/**
 * Autorole Delete Buttons Component
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
  getDeleteSession,
  clearDeleteSession,
  type DeleteSession,
} from "@/modules/autorole";
import { logModerationAction } from "@/utils/moderationLogger";

const ID_PREFIX = "autorole:delete:";

export default class AutoroleDeleteButtons extends ComponentCommand {
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

    const session = getDeleteSession(messageId);
    if (!session) {
      await ctx.write({
        content: "This action expired. Run the command again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (Date.now() > session.expiresAt) {
      clearDeleteSession(messageId);
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
        await this.handleCancel(ctx, session.slug, messageId);
        break;
      case "purge":
        await this.handlePurge(ctx, session);
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
    session: DeleteSession,
    messageId: string,
  ) {
    await ctx.deferUpdate();
    let deleted = false;
    try {
      deleted = await AutoroleService.deleteRule(session.guildId, session.slug);
    } catch (error) {
      ctx.client.logger?.error?.("[autorole] rule delete failed", {
        guildId: session.guildId,
        ruleName: session.slug,
        actorId: ctx.author.id,
        error,
      });
    }

    if (!deleted) {
      await ctx.followup({
        content: "Could not delete the rule. Try again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    clearDeleteSession(messageId);
    ctx.client.logger?.info?.("[autorole] rule deleted", {
      guildId: session.guildId,
      ruleName: session.slug,
      actorId: ctx.author.id,
    });

    await logModerationAction(ctx.client, session.guildId, {
      title: "Autorole Deleted",
      description: `Rule \`${session.slug}\` deleted`,
      actorId: ctx.author.id,
    });
    await disableWithStatus(ctx, session.slug, "Rule deleted");
  }

  private async handleCancel(
    ctx: ComponentContext<"Button">,
    slug: string,
    messageId: string,
  ) {
    await ctx.deferUpdate();
    clearDeleteSession(messageId);
    await disableWithStatus(ctx, slug, "Canceled");
  }

  private async handlePurge(
    ctx: ComponentContext<"Button">,
    session: DeleteSession,
  ) {
    await ctx.deferUpdate();
    const result = await AutoroleService.purgeRule(
      ctx.client,
      session.guildId,
      session.slug,
    );
    ctx.client.logger?.info?.("[autorole] rule purged", {
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
          name: "Roles updated",
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
        text: `Purged: removed ${result.removedGrants} grants and updated ${result.roleRevocations} roles.`,
      });

      await ctx.editResponse({
        embeds: [embed],
      });
    } catch (error) {
      ctx.client.logger?.warn?.("[autorole] failed to update purge embed", {
        error,
        guildId: session.guildId,
      });
    }
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
    .setCustomId(`autorole:delete:confirm:${slug}`)
    .setLabel("Confirm deletion")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);
  const purge = new Button()
    .setCustomId(`autorole:delete:purge:${slug}`)
    .setLabel("Purge active grants")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const cancel = new Button()
    .setCustomId(`autorole:delete:cancel:${slug}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  return new ActionRow<Button>().addComponents(confirm, purge, cancel);
}
