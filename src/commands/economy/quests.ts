import {
  ActionRow,
  Command,
  CommandContext,
  Declare,
  StringSelectMenu,
  StringSelectOption,
} from "seyfert";
import { Button, UI } from "@/modules/ui";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  buildQuestActionErrorEmbed,
  buildQuestActionSuccessEmbed,
  buildQuestBoardEmbed,
  buildQuestDetailsEmbed,
  rpgQuestService,
  type QuestBrowseView,
} from "@/modules/rpg/quests";

type QuestsUIState = {
  board: QuestBrowseView | null;
  selectedAvailableQuestId: string | null;
  selectedActiveQuestId: string | null;
  feedback: string | null;
  showDetails: boolean;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected quest error.";
}

function availableOptions(board: QuestBrowseView): StringSelectOption[] {
  return board.available.slice(0, 25).map((quest) =>
    new StringSelectOption()
      .setLabel(quest.title.slice(0, 100))
      .setValue(quest.id)
      .setDescription(`Difficulty: ${quest.difficulty}`),
  );
}

function activeOptions(board: QuestBrowseView): StringSelectOption[] {
  return board.active.slice(0, 25).map((entry) => {
    const status = entry.completed ? "ready" : "progress";
    return new StringSelectOption()
      .setLabel(entry.quest.title.slice(0, 100))
      .setValue(entry.quest.id)
      .setDescription(`Status: ${status}`);
  });
}

async function reloadBoard(
  guildId: string,
  userId: string,
): Promise<{ board: QuestBrowseView | null; error?: string }> {
  const boardResult = await rpgQuestService.getBoard(guildId, userId);
  if (boardResult.isErr()) {
    return {
      board: null,
      error: toErrorMessage(boardResult.error),
    };
  }

  return { board: boardResult.unwrap() };
}

@Declare({
  name: "quests",
  description: "RPG quest board",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 2000,
  uses: { default: 1 },
})
export default class QuestsCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        embeds: [buildQuestActionErrorEmbed("This command can only be used in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.deferReply(true);

    const initial = await reloadBoard(guildId, ctx.author.id);

    const ui = new UI<QuestsUIState>(
      {
        board: initial.board,
        selectedAvailableQuestId: null,
        selectedActiveQuestId: null,
        feedback: initial.error ?? null,
        showDetails: false,
      },
      (state) => {
        const rows: ActionRow<any>[] = [];

        const refreshButton = new Button()
          .setLabel("Refresh")
          .setStyle(ButtonStyle.Secondary)
          .onClick("quests_refresh", async () => {
            const refreshed = await reloadBoard(guildId, ctx.author.id);
            state.board = refreshed.board;
            state.feedback = refreshed.error ?? null;
            state.selectedAvailableQuestId = null;
            state.selectedActiveQuestId = null;
          });

        const detailsButton = new Button()
          .setLabel(state.showDetails ? "Hide Details" : "Show Details")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!state.board)
          .onClick("quests_toggle_details", async () => {
            state.showDetails = !state.showDetails;
          });

        rows.push(new ActionRow<Button>().addComponents(refreshButton, detailsButton));

        if (state.board) {
          if (state.board.available.length > 0) {
            const availableMenu = new StringSelectMenu()
              .setPlaceholder("Select quest to accept")
              .setValuesLength({ min: 1, max: 1 })
              .setOptions(availableOptions(state.board))
              .onSelect("quests_available_select", async (menuCtx) => {
                state.selectedAvailableQuestId =
                  menuCtx.interaction.values?.[0] ?? null;
              });

            rows.push(new ActionRow<StringSelectMenu>().addComponents(availableMenu));

            const acceptButton = new Button()
              .setLabel("Accept")
              .setStyle(ButtonStyle.Success)
              .setDisabled(!state.selectedAvailableQuestId)
              .onClick("quests_accept", async () => {
                if (!state.selectedAvailableQuestId) return;

                const accepted = await rpgQuestService.acceptQuest(
                  guildId,
                  ctx.author.id,
                  state.selectedAvailableQuestId,
                );

                if (accepted.isErr()) {
                  state.feedback = `❌ ${accepted.error.message}`;
                  return;
                }

                state.feedback = `✅ Accepted quest: ${state.selectedAvailableQuestId}`;
                const refreshed = await reloadBoard(guildId, ctx.author.id);
                state.board = refreshed.board;
                state.selectedAvailableQuestId = null;
                state.selectedActiveQuestId = null;
              });

            rows.push(new ActionRow<Button>().addComponents(acceptButton));
          }

          if (state.board.active.length > 0) {
            const activeMenu = new StringSelectMenu()
              .setPlaceholder("Select active quest")
              .setValuesLength({ min: 1, max: 1 })
              .setOptions(activeOptions(state.board))
              .onSelect("quests_active_select", async (menuCtx) => {
                state.selectedActiveQuestId = menuCtx.interaction.values?.[0] ?? null;
              });

            rows.push(new ActionRow<StringSelectMenu>().addComponents(activeMenu));

            const selectedActive = state.board.active.find(
              (entry) => entry.quest.id === state.selectedActiveQuestId,
            );

            const claimButton = new Button()
              .setLabel("Claim")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(!selectedActive || !selectedActive.completed)
              .onClick("quests_claim", async () => {
                if (!state.selectedActiveQuestId) return;

                const result = await rpgQuestService.claimRewards(
                  guildId,
                  ctx.author.id,
                  state.selectedActiveQuestId,
                );

                if (result.isErr()) {
                  state.feedback = `❌ ${result.error.message}`;
                  return;
                }

                const summary = result
                  .unwrap()
                  .appliedRewards.map((reward) => `${reward.amount} ${reward.id ?? reward.type}`)
                  .join(", ");

                state.feedback = `✅ Claimed rewards: ${summary || "none"}`;

                const refreshed = await reloadBoard(guildId, ctx.author.id);
                state.board = refreshed.board;
                state.selectedActiveQuestId = null;
              });

            const abandonButton = new Button()
              .setLabel("Abandon")
              .setStyle(ButtonStyle.Danger)
              .setDisabled(!state.selectedActiveQuestId)
              .onClick("quests_abandon", async () => {
                if (!state.selectedActiveQuestId) return;

                const result = await rpgQuestService.abandonQuest(
                  guildId,
                  ctx.author.id,
                  state.selectedActiveQuestId,
                );

                if (result.isErr()) {
                  state.feedback = `❌ ${result.error.message}`;
                  return;
                }

                state.feedback = `✅ Abandoned quest: ${state.selectedActiveQuestId}`;

                const refreshed = await reloadBoard(guildId, ctx.author.id);
                state.board = refreshed.board;
                state.selectedActiveQuestId = null;
              });

            rows.push(new ActionRow<Button>().addComponents(claimButton, abandonButton));
          }
        }

        if (!state.board) {
          return {
            embeds: [buildQuestActionErrorEmbed(state.feedback ?? "Could not load quests")],
            flags: MessageFlags.Ephemeral,
            components: rows,
          };
        }

        const embed = state.showDetails
          ? buildQuestDetailsEmbed(state.board)
          : buildQuestBoardEmbed(state.board, ctx.author.username);

        const feedbackEmbed = state.feedback
          ? state.feedback.startsWith("✅")
            ? buildQuestActionSuccessEmbed(state.feedback)
            : buildQuestActionErrorEmbed(state.feedback)
          : null;

        return {
          embeds: feedbackEmbed ? [embed, feedbackEmbed] : [embed],
          components: rows,
          flags: MessageFlags.Ephemeral,
        };
      },
      (msg) => ctx.editOrReply(msg),
    );

    await ui.send();
  }
}
