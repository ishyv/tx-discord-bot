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
	StringSelectMenu,
	StringSelectOption,
	SubCommand,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
	buildErrorEmbed,
	economyAccountService,
	getPerkDefinition,
	perkService,
} from "@/modules/economy";
import {
	buildEconomyInfoEmbed,
	buildPerkPurchaseEmbed,
} from "@/modules/economy/account/embeds";
import { currencyRegistry } from "@/modules/economy/transactions";
import { BindDisabled, Features } from "@/modules/features";
import { HelpDoc, HelpCategory } from "@/modules/help";
import { Button } from "@/modules/ui";
import { UIColors } from "@/modules/ui/design-system";

const buyOptions = {
	perk: createStringOption({
		description: "ID of the perk to purchase",
		required: true,
	}),
};

@HelpDoc({
	command: "perks",
	category: HelpCategory.Economy,
	description: "View and purchase server perks that provide bonuses and special abilities",
	usage: "/perks",
	notes: "Use /perks list to see available perks, then /perks buy to purchase one.",
})
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
export default class PerksParentCommand extends Command {}

@HelpDoc({
  command: "perks list",
  category: HelpCategory.Economy,
  description: "List all available perks and your current perk levels",
  usage: "/perks list",
})
@Declare({
	name: "list",
	description: "List available perks and your current levels",
})
export class PerksListCommand extends SubCommand {
	async run(ctx: GuildCommandContext) {
		const { guildId } = ctx;
		const userId = ctx.author.id;

		if (!guildId) {
			await ctx.write({
				embeds: [buildErrorEmbed("This command can only be used in a server.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const accountService = economyAccountService;
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
			const selectMenu = new StringSelectMenu()
				.setPlaceholder("Select a perk to purchase...")
				.setValuesLength({ min: 1, max: 1 })
				.setOptions(
					selectOptions.map((entry) =>
						new StringSelectOption()
							.setLabel(entry.label)
							.setValue(entry.value)
							.setDescription(entry.description),
					),
				)
				.onSelect("perk_buy_select", async (menuCtx) => {
					const perkId = menuCtx.interaction.values?.[0];
					if (!perkId) {
						await menuCtx.write({
							embeds: [buildErrorEmbed("No perk selected.")],
							flags: MessageFlags.Ephemeral,
						});
						return;
					}

					const perk = getPerkDefinition(perkId);
					if (!perk) {
						await menuCtx.write({
							embeds: [buildErrorEmbed("Perk not found.")],
							flags: MessageFlags.Ephemeral,
						});
						return;
					}

					await showConfirmation(menuCtx as any, guildId, userId, perkId);
				});

			const row = new ActionRow<typeof selectMenu>().addComponents(selectMenu);
			components.push(row);
		}

		await ctx.write({ embeds: [embed], components });
	}
}

@HelpDoc({
  command: "perks buy",
  category: HelpCategory.Economy,
  description: "Purchase a perk upgrade (use /perks list menu for easier selection)",
  usage: "/perks buy <perk_id>",
})
@Declare({
	name: "buy",
	description:
		"Purchase a perk (use the menu from /perks list for easier selection)",
})
export class PerksBuyCommand extends SubCommand {
	async run(ctx: GuildCommandContext<typeof buyOptions>) {
		const { guildId } = ctx;
		const userId = ctx.author.id;
		const perkId = ctx.options.perk;

		if (!guildId) {
			await ctx.editOrReply({
				content: "This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const perk = getPerkDefinition(perkId);
		if (!perk) {
			await ctx.editOrReply({
				content: `❌ Perk "${perkId}" not found. Use \`/perks list\` to see the available ones.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Show confirmation
		await showConfirmation(ctx, guildId, userId, perkId);
	}
}

// Extracted helper function
async function showConfirmation(
	ctx: { write: (message: any) => Promise<any> },
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

	const confirmBtn = new Button()
		.setLabel("✓ Buy")
		.setStyle(ButtonStyle.Success)
		.onClick("perk_confirm", async (buttonCtx) => {
			const result = await perkService.purchasePerk({
				guildId,
				userId,
				perkId,
			});

			if (result.isErr()) {
				const error = result.error;
				const messages: Record<string, string> = {
					PERK_NOT_FOUND: "Perk not found.",
					PERK_MAXED: "That perk is already at max level.",
					INSUFFICIENT_FUNDS: "You do not have enough funds.",
					LEVEL_REQUIRED: "You do not meet the required level.",
					ACCOUNT_BLOCKED: "Your account has restrictions.",
					ACCOUNT_BANNED: "Your account is suspended.",
					CONFLICT: "Concurrency conflict. Try again.",
				};

				await buttonCtx.write({
					embeds: [
						buildErrorEmbed(
							messages[error.code] ?? "Error purchasing the perk.",
						),
					],
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const purchase = result.unwrap();
			const purchasedPerk = getPerkDefinition(purchase.perkId);
			const currencyObj = currencyRegistry.get(purchase.cost.currencyId);
			const display = (n: number) =>
				currencyObj?.displayAmount(n) ?? `${n} ${purchase.cost.currencyId}`;

			const resultEmbed = buildPerkPurchaseEmbed({
				perkName: purchasedPerk?.name ?? purchase.perkId,
				level: purchase.afterLevel,
				cost: purchase.cost.amount,
				display,
				balanceBefore: 0, // Not tracked for perks
				balanceAfter: 0,
				correlationId: `perk_${Date.now()}`,
			});

			await buttonCtx.write({
				embeds: [resultEmbed],
				flags: MessageFlags.Ephemeral,
			});
		});

	const cancelBtn = new Button()
		.setLabel("✕ Cancel")
		.setStyle(ButtonStyle.Secondary)
		.onClick("perk_cancel", async (buttonCtx) => {
			await buttonCtx.write({
				embeds: [
					buildEconomyInfoEmbed({
						title: "Purchase Canceled",
						emoji: "ℹ️",
						description: "No changes were made.",
					}),
				],
				flags: MessageFlags.Ephemeral,
			});
		});

	const row = new ActionRow<typeof confirmBtn>().addComponents(
		confirmBtn,
		cancelBtn,
	);

	await ctx.write({
		embeds: [embed],
		components: [row],
		flags: MessageFlags.Ephemeral,
	});
}
