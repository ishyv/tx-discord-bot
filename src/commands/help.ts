/**
 * Help Command.
 *
 * Purpose: Central documentation hub for all bot commands. Presents a
 * category-based home screen and paginated per-category command listings,
 * all within an ephemeral interactive UI.
 *
 * Concept: Uses the reactive UI system (UI class + Button.onClick) to manage
 * two screens — Home and Category — with pagination for long command lists.
 * Commands self-register via @HelpDoc so this file never needs manual updates.
 *
 * Scope: Presentation only. All data comes from helpRegistry.
 */
import { ActionRow, Command, Declare, Embed } from "seyfert";
import type { CommandContext } from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { Button, UI } from "@/modules/ui";
import {
  UIColors,
  Emoji,
} from "@/modules/ui/design-system";
import {
  helpRegistry,
  HelpCategory,
  CATEGORY_META,
  type HelpEntryData,
} from "@/modules/help";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Max commands shown per page in the category view. */
const COMMANDS_PER_PAGE = 5;

// ============================================================================
// STATE
// ============================================================================

type Screen = "home" | "category";

type HelpUIState = {
  screen: Screen;
  category: HelpCategory | null;
  page: number;
};

// ============================================================================
// EMBED BUILDERS
// ============================================================================

function buildHomeEmbed(categories: HelpCategory[]): Embed {
  const embed = new Embed()
    .setColor(UIColors.info)
    .setTitle(`${Emoji.help} Command Help`)
    .setDescription(
      `Browse commands by category. Select a category below to see what's available.\n\u200b`,
    );

  for (const cat of categories) {
    const meta = CATEGORY_META[cat];
    const count = helpRegistry.countByCategory(cat);
    embed.addFields({
      name: `${meta.emoji} ${meta.label}`,
      value: `${meta.tagline}\n\`${count} command${count === 1 ? "" : "s"}\``,
      inline: true,
    });
  }

  embed.setFooter({
    text: `${helpRegistry.size} commands registered · Use the buttons below to explore`,
  });

  return embed;
}

function buildCategoryEmbed(
  category: HelpCategory,
  entries: HelpEntryData[],
  page: number,
  totalPages: number,
): Embed {
  const meta = CATEGORY_META[category];
  const start = page * COMMANDS_PER_PAGE;
  const slice = entries.slice(start, start + COMMANDS_PER_PAGE);

  const embed = new Embed()
    .setColor(UIColors.void)
    .setTitle(`${meta.emoji} ${meta.label} Commands`)
    .setDescription(`${meta.tagline}\n\u200b`);

  for (const entry of slice) {
    const lines: string[] = [];
    lines.push(entry.description);
    if (entry.usage) {
      lines.push(`**Usage:** \`${entry.usage}\``);
    }
    if (entry.examples?.length) {
      lines.push(`**Examples:** ${entry.examples.map((e) => `\`${e}\``).join(", ")}`);
    }
    if (entry.permissions?.length) {
      lines.push(`**Requires:** ${entry.permissions.join(", ")}`);
    }
    if (entry.notes) {
      lines.push(`💡 ${entry.notes}`);
    }

    embed.addFields({
      name: `/${entry.command}`,
      value: lines.join("\n"),
      inline: false,
    });
  }

  embed.setFooter({
    text: `Page ${page + 1}/${totalPages} · ${entries.length} command${entries.length === 1 ? "" : "s"} in this category`,
  });

  return embed;
}

// ============================================================================
// BUTTON ROW BUILDERS
// ============================================================================

/**
 * Build the home screen category button rows.
 * Discord allows max 5 buttons per row and max 5 rows per message.
 * We chunk categories into rows of up to 4, reserving nothing (no back btn on home).
 */
function buildCategoryRows(
  categories: HelpCategory[],
  state: HelpUIState,
): ActionRow<Button>[] {
  const rows: ActionRow<Button>[] = [];
  const BUTTONS_PER_ROW = 4;

  for (let i = 0; i < categories.length; i += BUTTONS_PER_ROW) {
    const chunk = categories.slice(i, i + BUTTONS_PER_ROW);
    const row = new ActionRow<Button>();

    for (const cat of chunk) {
      const meta = CATEGORY_META[cat];
      const btn = new Button()
        .setLabel(`${meta.emoji} ${meta.label}`)
        .setStyle(ButtonStyle.Secondary)
        .onClick(`help_cat_${cat}`, async () => {
          state.screen = "category";
          state.category = cat;
          state.page = 0;
        });
      row.addComponents(btn);
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Build the category screen navigation row: Prev | Page X/N | Next | 🏠 Home
 */
function buildNavRow(
  state: HelpUIState,
  totalPages: number,
): ActionRow<Button> {
  const prev = new Button()
    .setLabel("◀ Prev")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(state.page <= 0)
    .onClick("help_prev", async () => {
      if (state.page > 0) state.page -= 1;
    });

  const indicator = new Button()
    .setCustomId("help_page_indicator")
    .setLabel(`Page ${state.page + 1}/${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const next = new Button()
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(state.page >= totalPages - 1)
    .onClick("help_next", async () => {
      if (state.page < totalPages - 1) state.page += 1;
    });

  const home = new Button()
    .setLabel("🏠 Home")
    .setStyle(ButtonStyle.Primary)
    .onClick("help_home", async () => {
      state.screen = "home";
      state.category = null;
      state.page = 0;
    });

  return new ActionRow<Button>().addComponents(prev, indicator, next, home);
}

// ============================================================================
// COMMAND
// ============================================================================

@Declare({
  name: "help",
  description: "📖 Browse documentation for all bot commands",
  integrationTypes: ["GuildInstall"],
})
export default class HelpCommand extends Command {
  async run(ctx: CommandContext) {
    const categories = helpRegistry.getPopulatedCategories();

    await new UI<HelpUIState>(
      {
        screen: "home",
        category: null,
        page: 0,
      },
      (state) => {
        // ── HOME SCREEN ──────────────────────────────────────────────────────
        if (state.screen === "home" || !state.category) {
          const categoryRows = buildCategoryRows(categories, state);

          return {
            embeds: [buildHomeEmbed(categories)],
            components: categoryRows,
            flags: MessageFlags.Ephemeral,
          };
        }

        // ── CATEGORY SCREEN ──────────────────────────────────────────────────
        const entries = helpRegistry.getByCategory(state.category);
        const totalPages = Math.max(1, Math.ceil(entries.length / COMMANDS_PER_PAGE));
        const page = Math.min(Math.max(state.page, 0), totalPages - 1);

        const navRow = buildNavRow(state, totalPages);

        return {
          embeds: [buildCategoryEmbed(state.category, entries, page, totalPages)],
          components: [navRow],
          flags: MessageFlags.Ephemeral,
        };
      },
      (msg) => ctx.editOrReply(msg),
    ).send();
  }
}
