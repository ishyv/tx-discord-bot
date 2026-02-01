/**
 * Autorole Delete Command.
 *
 * Purpose: Delete an auto-role rule with optional active assignment purging.
 */
import {
  ActionRow,
  Button,
  Declare,
  Embed,
  Options,
  SubCommand,
  createStringOption,
  type GuildCommandContext,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";
import { UIColors } from "@/modules/ui/design-system";

import {
  AutoRoleRulesStore,
  autoroleKeys,
  clearDeleteSession,
  getDeleteSession,
  storeDeleteSession,
} from "@/modules/autorole";

import {
  formatRuleMode,
  formatTrigger,
  respondRuleAutocomplete,
  requireAutoroleContext,
} from "./shared";

const options = {
  name: createStringOption({
    description: "Name of the rule to delete",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

const TTL_MS = 60_000;

@Declare({
  name: "delete",
  description: "Delete an auto-role rule",
})
@Options(options)
export default class AutoroleDeleteCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof options>) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const slug = ctx.options.name.trim().toLowerCase();
    const id = autoroleKeys.rule(context.guildId, slug);
    const res = await AutoRoleRulesStore.get(id);
    const rule = res.isOk() ? res.unwrap() : null;
    if (!rule) {
      await ctx.write({ content: `No rule found named \`${slug}\`.` });
      return;
    }

    const embed = new Embed()
      .setTitle(`Delete auto-role rule: ${rule.name}`)
      .setColor(UIColors.error)
      .setFields([
        {
          name: "Trigger",
          value: `\`${formatTrigger(rule.trigger)}\``,
          inline: false,
        },
        {
          name: "Role",
          value: `<@&${rule.roleId}>`,
          inline: false,
        },
        {
          name: "Mode",
          value: formatRuleMode(rule),
          inline: false,
        },
        {
          name: "Note",
          value:
            "Temporary assignments are not automatically revoked. Use **Purge active assignments** to remove current roles.",
        },
      ]);

    const { row } = buildButtonRow(rule.name);

    const message = await ctx.editOrReply(
      {
        embeds: [embed],
        components: [row],
      },
      true,
    );

    if (!message) return;

    storeDeleteSession({
      messageId: message.id,
      channelId: message.channelId ?? ctx.channelId,
      guildId: context.guildId,
      slug: rule.name,
      invokerId: ctx.author.id,
      expiresAt: Date.now() + TTL_MS,
    });

    scheduleExpiry(ctx, message.id, message.channelId ?? ctx.channelId);
  }
}

function buildButtonRow(slug: string) {
  const confirm = new Button()
    .setCustomId(`autorole:delete:confirm:${slug}`)
    .setLabel("Confirm Deletion")
    .setStyle(ButtonStyle.Danger);
  const purge = new Button()
    .setCustomId(`autorole:delete:purge:${slug}`)
    .setLabel("Purge Active Assignments")
    .setStyle(ButtonStyle.Primary);
  const cancel = new Button()
    .setCustomId(`autorole:delete:cancel:${slug}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRow<Button>().addComponents(confirm, purge, cancel);
  return { row, confirm, purge, cancel };
}

function scheduleExpiry(
  ctx: GuildCommandContext,
  messageId: string,
  channelId: string,
) {
  setTimeout(async () => {
    const session = getDeleteSession(messageId);
    if (!session) return;
    if (Date.now() <= session.expiresAt) return;

    clearDeleteSession(messageId);

    const row = buildDisabledRow(session.slug);

    try {
      const current = await ctx.client.messages
        .fetch(messageId, channelId)
        .catch(() => null);
      const embedJson = current?.embeds?.[0]
        ? [
          new Embed(current.embeds[0])
            .setFooter({ text: "Expired" })
            .toJSON(),
        ]
        : undefined;
      await ctx.client.messages.edit(messageId, channelId, {
        components: [row],
        content: "Expired",
        embeds: embedJson,
      });
    } catch (error) {
      ctx.client.logger?.warn?.("[autorole] failed to expire delete flow", {
        error,
        guildId: session.guildId,
        messageId,
      });
    }
  }, TTL_MS + 1_000);
}
function buildDisabledRow(slug: string): ActionRow<Button> {
  const confirm = new Button()
    .setCustomId(`autorole:delete:confirm:${slug}`)
    .setLabel("Confirm Deletion")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);
  const purge = new Button()
    .setCustomId(`autorole:delete:purge:${slug}`)
    .setLabel("Purge Active Assignments")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);
  const cancel = new Button()
    .setCustomId(`autorole:delete:cancel:${slug}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  return new ActionRow<Button>().addComponents(confirm, purge, cancel);
}
