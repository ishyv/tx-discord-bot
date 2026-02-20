/**
 * Autorole Purge Command
 */
import {
  ActionRow,
  Button,
  createStringOption,
  Declare,
  Embed,
  Options,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { ButtonStyle } from "seyfert/lib/types";

import { HelpDoc, HelpCategory } from "@/modules/help";
import { UIColors } from "@/modules/ui/design-system";
import {
  AutoRoleRulesStore,
  autoroleKeys,
  clearPurgeSession,
  getPurgeSession,
  storePurgeSession,
} from "@/modules/autorole";
import { respondRuleAutocomplete, requireAutoroleContext } from "./shared";

const options = {
  name: createStringOption({
    description: "Name of the rule to purge",
    required: true,
    autocomplete: respondRuleAutocomplete,
  }),
};

const TTL_MS = 60_000;

@HelpDoc({
  command: "autorole purge",
  category: HelpCategory.Moderation,
  description: "Revoke all roles that were granted by a specific auto-role rule",
  usage: "/autorole purge <rule_id>",
  permissions: ["ManageRoles"],
})
@Declare({
  name: "purge",
  description: "Revoke roles granted by a rule",
})
@Options(options)
export default class AutorolePurgeCommand extends SubCommand {
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
      .setTitle(`Purge active grants: ${rule.name}`)
      .setColor(UIColors.warning)
      .setDescription(
        `This will revoke the role <@&${rule.roleId}> from **all users** who received it through this rule.\n\nThis action cannot be undone.`,
      );

    const confirm = new Button()
      .setCustomId(`autorole:purge:confirm:${slug}`)
      .setLabel("Confirm Purge")
      .setStyle(ButtonStyle.Danger);
    const cancel = new Button()
      .setCustomId(`autorole:purge:cancel:${slug}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);
    const row = new ActionRow<Button>().addComponents(confirm, cancel);

    const message = await ctx.editOrReply({ embeds: [embed], components: [row] }, true);
    if (!message) return;

    storePurgeSession({
      messageId: message.id,
      channelId: message.channelId ?? ctx.channelId,
      guildId: context.guildId,
      slug: rule.name,
      invokerId: ctx.author.id,
      expiresAt: Date.now() + TTL_MS,
    });

    setTimeout(async () => {
      const session = getPurgeSession(message.id);
      if (!session) return;
      if (Date.now() <= session.expiresAt) return;

      clearPurgeSession(message.id);

      const disabledRow = buildDisabledRow(slug);
      try {
        const current = await ctx.client.messages
          .fetch(message.id, message.channelId ?? ctx.channelId)
          .catch(() => null);
        const embedJson = current?.embeds?.[0]
          ? [new Embed(current.embeds[0]).setFooter({ text: "Expired" }).toJSON()]
          : undefined;
        await ctx.client.messages.edit(message.id, message.channelId ?? ctx.channelId, {
          components: [disabledRow],
          embeds: embedJson,
        });
      } catch (error) {
        ctx.client.logger?.warn?.("[autorole] failed to expire purge flow", {
          error,
          guildId: context.guildId,
          messageId: message.id,
        });
      }
    }, TTL_MS + 1_000);
  }
}

function buildDisabledRow(slug: string): ActionRow<Button> {
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
