/**
 * Perks Command.
 *
 * Purpose: List and purchase perks for the current guild.
 * Subcommands: list, buy
 */
import {
  ActionRow,
  Command,
  createStringOption,
  Declare,
  Embed,
  type GuildCommandContext,
  SubCommand,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { UIColors } from "@/modules/ui/design-system";

import {
  createEconomyAccountService,
  economyAccountRepo,
  getPerkDefinition,
  perkService,
  buildErrorEmbed,
} from "@/modules/economy";
import { buildPerkPurchaseEmbed } from "@/modules/economy/account/embeds";
import { currencyRegistry } from "@/modules/economy/transactions";

import { BindDisabled, Features } from "@/modules/features";
import {
  createSelectMenu,
  createButton,
  replyEphemeral,
  getContextInfo,
  getSelectValue,
} from "@/adapters/seyfert";

// In-memory pending purchases (userId -> perkId) for confirmation flow
const pendingPurchases = new Map<string, { guildId: string; perkId: string }>();

const buyOptions = {
  perk: createStringOption({
    description: "ID of the perk to purchase",
    required: true,
  }),
};

@Declare({
  name: "perks",
  description: "View and purchase perks for this server",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class PerksParentCommand extends Command { }

@Declare({
  name: "list",
  description: "List available perks and your current levels",
})
export class PerksListCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { guildId, userId } = getContextInfo(ctx);

    if (!guildId) {
      await ctx.write({
        embeds: [buildErrorEmbed("This command can only be used in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const accountService = createEconomyAccountService(economyAccountRepo);
    const ensureResult = await accountService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not load your account.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        embeds: [buildErrorEmbed("Your account has restrictions.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const perksResult = await perkService.listPerks(guildId, userId);
    if (perksResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("Could not load perks.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const perks = perksResult.unwrap();

    if (perks.length === 0) {
      await ctx.write({
        embeds: [buildErrorEmbed("No perks available in this server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Build embed with VOID ARCHIVE styling
    const embed = new Embed()
      .setColor(UIColors.amethyst)
      .setTitle("🎖️ Available Perks")
      .setDescription("Enhance your abilities with permanent upgrades.");

    const selectOptions = perks
      .filter((p) => p.level < p.maxLevel)
      .slice(0, 25)
      .map((p) => ({
        label: `${p.name} (Lv.${p.level + 1})`,
        value: p.id,
        description: `Cost: ${p.nextCost?.amount ?? "?"} ${p.nextCost?.currencyId ?? "coins"}`,
      }));

    for (const perk of perks) {
      const levelText =
        perk.level >= perk.maxLevel
          ? "✅ MAX"
          : `Lv.${perk.level}/${perk.maxLevel}`;

      const costText = perk.nextCost
        ? `➡️ Next: \`${perk.nextCost.amount}\` ${perk.nextCost.currencyId}${perk.nextCost.minLevel ? ` (requires Lv.${perk.nextCost.minLevel})` : ""}`
        : "✅ Max level reached";

      const effectsText = perk.effects
        .map((e) => {
          const valueText =
            e.value < 1 && e.value > 0
              ? `+${(e.value * 100).toFixed(0)}%`
              : `+${e.value}`;
          switch (e.type) {
            case "weight_cap":
              return `${valueText} weight`;
            case "slot_cap":
              return `${valueText} slots`;
            case "work_bonus_pct":
              return `${valueText} work`;
            case "daily_bonus_cap":
              return `${valueText} streak`;
            default:
              return "";
          }
        })
        .join(", ");

      // Use design system markers
      const marker = perk.level >= perk.maxLevel ? "◇" : "◈";

      embed.addFields({
        name: `${marker} **${perk.name}** — ${levelText}`,
        value: `${perk.description}\n📊 ${effectsText}\n${costText}`,
        inline: false,
      });
    }

    const components: ActionRow<any>[] = [];

    if (selectOptions.length > 0) {
      const selectMenu = createSelectMenu({
        customId: `perk_buy_select_${userId}`,
        placeholder: "Select a perk to purchase...",
        options: selectOptions,
      });

      const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);
      components.push(row);
    }

    await ctx.write({ embeds: [embed], components });
  }
}

@Declare({
  name: "buy",
  description:
    "Purchase a perk (use the menu from /perks list for easier selection)",
})
export class PerksBuyCommand extends SubCommand {
  async run(ctx: GuildCommandContext<typeof buyOptions>) {
    const { guildId, userId } = getContextInfo(ctx);
    const perkId = ctx.options.perk;

    if (!guildId) {
      await replyEphemeral(ctx, {
        content: "This command can only be used in a server.",
      });
      return;
    }

    const perk = getPerkDefinition(perkId);
    if (!perk) {
      await replyEphemeral(ctx, {
        content: `❌ Perk "${perkId}" no encontrado. Usa \`/perks list\` para ver los disponibles.`,
      });
      return;
    }

    // Show confirmation
    await showConfirmation(ctx, guildId, userId, perkId);
  }
}

// Extracted helper function
async function showConfirmation(
  ctx: GuildCommandContext,
  guildId: string,
  userId: string,
  perkId: string,
) {
  const stateResult = await perkService.getState(guildId, userId);
  if (stateResult.isErr()) {
    await ctx.write({
      embeds: [buildErrorEmbed("Could not load your perk state.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const state = stateResult.unwrap();
  const currentLevel = state.levels[perkId] ?? 0;
  const perk = getPerkDefinition(perkId);

  if (!perk) {
    await ctx.write({
      embeds: [buildErrorEmbed("Perk not found.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (currentLevel >= perk.maxLevel) {
    await ctx.write({
      embeds: [
        buildErrorEmbed(
          `${perk.name} is already at max level (${perk.maxLevel}).`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const nextCost = perk.cost(currentLevel + 1);

  const embed = new Embed()
    .setColor(UIColors.warning)
    .setTitle(`🛒 Confirm Purchase`)
    .setDescription(
      `Purchase **${perk.name}** Lv.${currentLevel + 1}?\n\n` +
      `💰 Cost: **\`${nextCost.amount}\`** ${nextCost.currencyId}\n` +
      (nextCost.minLevel ? `📈 Requires level: ${nextCost.minLevel}\n` : "") +
      `\n✨ Effects: ${perk.effects
        .map((e) => {
          const valueText =
            e.value < 1 && e.value > 0
              ? `+${(e.value * 100).toFixed(0)}%`
              : `+${e.value}`;
          return `${valueText}`;
        })
        .join(", ")}`,
    );

  const confirmBtn = createButton({
    customId: `perk_confirm_${userId}_${perkId}`,
    label: "✓ Buy",
    style: ButtonStyle.Success,
  });

  const cancelBtn = createButton({
    customId: `perk_cancel_${userId}`,
    label: "✕ Cancel",
    style: ButtonStyle.Secondary,
  });

  const row = new ActionRow<typeof confirmBtn>().addComponents(
    confirmBtn,
    cancelBtn,
  );

  pendingPurchases.set(userId, { guildId, perkId });

  await ctx.write({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

// Component handlers
@Declare({
  name: "perk_buy_select",
  description: "Select menu for buying perks",
})
export class PerkBuySelectHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    const perkId = getSelectValue(ctx);
    if (!perkId) {
      await ctx.write({
        embeds: [buildErrorEmbed("No perk selected.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show confirmation
    const perk = getPerkDefinition(perkId);
    if (!perk) {
      await ctx.write({
        embeds: [buildErrorEmbed("Perk not found.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await showConfirmation(ctx, guildId, userId, perkId);
  }
}

@Declare({
  name: "perk_confirm",
  description: "Confirm perk purchase button",
})
export class PerkConfirmHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId, guildId } = getContextInfo(ctx);

    if (!guildId) return;

    const pending = pendingPurchases.get(userId);
    if (!pending || pending.guildId !== guildId) {
      await ctx.write({
        embeds: [
          buildErrorEmbed("No tienes una compra pendiente o ha expirado."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    pendingPurchases.delete(userId);

    const result = await perkService.purchasePerk({
      guildId,
      userId,
      perkId: pending.perkId,
    });

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        PERK_NOT_FOUND: "Perk no encontrado.",
        PERK_MAXED: "El perk ya está en nivel máximo.",
        INSUFFICIENT_FUNDS: "No tienes suficientes fondos.",
        LEVEL_REQUIRED: "No tienes el nivel requerido.",
        ACCOUNT_BLOCKED: "Tu cuenta tiene restricciones.",
        ACCOUNT_BANNED: "Tu cuenta está suspendida.",
        CONFLICT: "Conflicto de concurrencia. Intenta de nuevo.",
      };

      await ctx.write({
        embeds: [
          buildErrorEmbed(messages[error.code] ?? "Error al comprar el perk."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const purchase = result.unwrap();
    const perk = getPerkDefinition(purchase.perkId);
    const currencyObj = currencyRegistry.get(purchase.cost.currencyId);
    const display = (n: number) =>
      currencyObj?.display(n as any) ?? `${n} ${purchase.cost.currencyId}`;

    const embed = buildPerkPurchaseEmbed({
      perkName: perk?.name ?? purchase.perkId,
      level: purchase.afterLevel,
      cost: purchase.cost.amount,
      display,
      balanceBefore: 0, // Not tracked for perks
      balanceAfter: 0,
      correlationId: `perk_${Date.now()}`,
    });

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

@Declare({
  name: "perk_cancel",
  description: "Cancel perk purchase button",
})
export class PerkCancelHandler extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const { userId } = getContextInfo(ctx);
    pendingPurchases.delete(userId);

    await ctx.write({
      embeds: [buildErrorEmbed("Compra cancelada.")],
      flags: MessageFlags.Ephemeral,
    });
  }
}
