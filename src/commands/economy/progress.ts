/**
 * Progress Command.
 *
 * Purpose: Display XP + level progression for the current guild.
 */

import { Command, Declare, type CommandContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import {
  economyAccountRepo,
  createEconomyAccountService,
  buildProgressEmbed,
  buildAccessDeniedEmbed,
  buildAccountCreatedEmbed,
  buildErrorEmbed,
  progressionService,
  dailyClaimRepo,
} from "@/modules/economy";

const economyService = createEconomyAccountService(economyAccountRepo);

@Declare({
  name: "progress",
  description: "Muestra tu progreso de XP y nivel en este servidor.",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 3000,
  uses: { default: 1 },
})
export default class ProgressCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userId = ctx.author.id;
    const ensureResult = await economyService.ensureAccount(userId);
    if (ensureResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("No pude cargar tu progreso.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { account, isNew } = ensureResult.unwrap();
    if (account.status !== "ok") {
      await ctx.write({
        embeds: [buildAccessDeniedEmbed(account.status)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const progressResult = await progressionService.getProgressView(
      guildId,
      userId,
    );
    if (progressResult.isErr()) {
      await ctx.write({
        embeds: [buildErrorEmbed("No pude cargar tu progreso.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const streakResult = await dailyClaimRepo.getStatus(guildId, userId);
    const streak = streakResult.isOk() ? streakResult.unwrap() : null;

    const embed = buildProgressEmbed(
      progressResult.unwrap(),
      ctx.author.username,
      ctx.author.avatarURL(),
      streak,
    );

    if (isNew) {
      await ctx.write({
        embeds: [buildAccountCreatedEmbed(ctx.author.username), embed],
      });
      return;
    }

    await ctx.write({ embeds: [embed] });
  }
}
