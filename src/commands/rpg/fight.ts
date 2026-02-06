/**
 * Fight Command.
 *
 * Purpose: Challenge players to combat, accept fights, and submit moves.
 * Context: RPG combat system with moves (attack, block, crit).
 */
import {
  Command,
  Declare,
  GuildCommandContext,
  Options,
  createStringOption,
  createUserOption,
  Embed,
  ActionRow,
} from "seyfert";
import { ButtonStyle, MessageFlags } from "seyfert/lib/types";
import { BindDisabled, Features } from "@/modules/features";
import { Cooldown, CooldownType } from "@/modules/cooldown";
import { rpgFightService } from "@/modules/rpg/combat/fight-service";
import { rpgProfileRepo } from "@/modules/rpg/profile/repository";
import { RpgViews } from "@/modules/rpg/views/embeds";
import { HpBarRenderer } from "@/modules/rpg/views/hp-bar";
import { buildRoundCard } from "@/modules/rpg/views/combat/round-card";
import { COMBAT_CONFIG } from "@/modules/rpg/config";
import { getItemDefinition } from "@/modules/inventory/items";
import { createButton, replyEphemeral } from "@/adapters/seyfert";

const options = {
  action: createStringOption({
    description: "Fight action",
    required: true,
    choices: [
      { name: "Challenge a player", value: "challenge" },
      { name: "Accept a challenge", value: "accept" },
      { name: "View fight status", value: "status" },
      { name: "Forfeit current fight", value: "forfeit" },
    ],
  }),
  user: createUserOption({
    description: "User to challenge (for challenge action)",
    required: false,
  }),
};

@Declare({
  name: "fight",
  description: "RPG combat - challenge, accept, and fight other players",
  contexts: ["Guild"],
  integrationTypes: ["GuildInstall"],
})
@BindDisabled(Features.Economy)
@Cooldown({
  type: CooldownType.User,
  interval: 5000,
  uses: { default: 1 },
})
@Options(options)
export default class FightCommand extends Command {
  async run(ctx: GuildCommandContext<typeof options>) {
    const { action, user: targetUser } = ctx.options;
    const userId = ctx.author.id;
    const guildId = ctx.guildId ?? undefined;

    switch (action) {
      case "challenge":
        await ctx.deferReply(false);
        if (!targetUser) {
          await ctx.editOrReply({
            content: "❌ Please specify a user to challenge with the `user` option.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await this.challenge(ctx, userId, targetUser.id, guildId);
        break;

      case "accept":
        await ctx.deferReply(true);
        await this.showPendingChallenges(ctx, userId);
        break;

      case "status":
        await ctx.deferReply(true);
        await this.showStatus(ctx, userId);
        break;

      case "forfeit":
        await ctx.deferReply(true);
        await this.forfeit(ctx, userId);
        break;
    }
  }

  private async challenge(
    ctx: GuildCommandContext<typeof options>,
    inviterId: string,
    targetId: string,
    guildId: string | undefined,
  ) {
    // Check profiles exist
    const [inviterProfile, targetProfile] = await Promise.all([
      rpgProfileRepo.findById(inviterId),
      rpgProfileRepo.findById(targetId),
    ]);

    if (inviterProfile.isErr() || !inviterProfile.unwrap()) {
      await replyEphemeral(ctx, {
        content: "❌ You need an RPG profile first! Use `/rpg profile` to create one.",
      });
      return;
    }

    if (targetProfile.isErr() || !targetProfile.unwrap()) {
      await replyEphemeral(ctx, {
        content: "❌ That user doesn't have an RPG profile.",
      });
      return;
    }

    // Check inviter not in combat
    if (inviterProfile.unwrap()!.isFighting) {
      await replyEphemeral(ctx, {
        content: "❌ You are already in a fight!",
      });
      return;
    }

    // Create challenge
    const result = await rpgFightService.challenge(
      { inviterId, targetId, guildId },
      (itemId) => {
        const def = getItemDefinition(itemId);
        return def?.stats
          ? { atk: def.stats.atk, def: def.stats.def, hp: def.stats.hp }
          : null;
      },
    );

    if (result.isErr()) {
      const error = result.error;
      const messages: Record<string, string> = {
        SELF_COMBAT: "❌ You can't fight yourself!",
        IN_COMBAT: "❌ One of you is already in a fight!",
        UPDATE_FAILED: "❌ Failed to create challenge.",
      };

      await replyEphemeral(ctx, {
        content: messages[(error as { code?: string }).code ?? ""] ?? `❌ ${error.message}`,
      });
      return;
    }

    const { fightId, expiresAt } = result.unwrap();

    // Create embed
    const embedData = RpgViews.combatInvite(
      ctx.author.username,
      ctx.options.user?.username ?? "Unknown",
      expiresAt,
    );

    const embed = new Embed()
      .setTitle(embedData.title)
      .setDescription(embedData.description)
      .setColor(embedData.color);

    // Buttons for target
    const acceptBtn = createButton({
      customId: `fight_accept_${fightId}_${targetId}`,
      label: "✅ Accept",
      style: ButtonStyle.Success,
    });

    const declineBtn = createButton({
      customId: `fight_decline_${fightId}_${targetId}`,
      label: "❌ Decline",
      style: ButtonStyle.Danger,
    });

    const row = new ActionRow<typeof acceptBtn>().addComponents(acceptBtn, declineBtn);

    await ctx.editOrReply({
      content: `<@${targetId}>, you've been challenged to a duel!`,
      embeds: [embed],
      components: [row],
    });
  }

  private async showPendingChallenges(ctx: GuildCommandContext, userId: string) {
    // Find pending fight where user is p2
    const activeFight = await rpgFightService.isInFight(userId);

    if (!activeFight) {
      await replyEphemeral(ctx, { content: "❌ You don't have any pending challenges." });
      return;
    }

    // Get fight details
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isOk() && profileResult.unwrap()) {
      const activeFightId = profileResult.unwrap()!.activeFightId;
      if (activeFightId) {
        const fightResult = await rpgFightService.getFight(activeFightId);
        if (fightResult.isOk() && fightResult.unwrap()) {
          const fight = fightResult.unwrap()!;
          if (fight.status === "pending" && fight.p2Id === userId) {
            // Show accept button
            const embed = new Embed()
              .setTitle("⚔️ Pending Challenge")
              .setDescription("You have a pending duel challenge! Click below to accept.")
              .setColor(0xffa500);

            const acceptBtn = createButton({
              customId: `fight_accept_${fight.fightId}_${userId}`,
              label: "✅ Accept Challenge",
              style: ButtonStyle.Success,
            });

            const row = new ActionRow<typeof acceptBtn>().addComponents(acceptBtn);

            await ctx.editOrReply({ embeds: [embed], components: [row], flags: 64 });
            return;
          }
        }
      }
    }

    await replyEphemeral(ctx, { content: "❌ You don't have any pending challenges." });
  }

  private async showStatus(ctx: GuildCommandContext, userId: string) {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()) {
      await replyEphemeral(ctx, {
        content: "❌ You need an RPG profile first!",
      });
      return;
    }

    const profile = profileResult.unwrap()!;

    if (!profile.isFighting || !profile.activeFightId) {
      await replyEphemeral(ctx, { content: "ℹ️ You are not currently in a fight." });
      return;
    }

    const fightResult = await rpgFightService.getFight(profile.activeFightId);
    if (fightResult.isErr() || !fightResult.unwrap()) {
      await replyEphemeral(ctx, { content: "❌ Could not load fight status." });
      return;
    }

    const fight = fightResult.unwrap()!;

    // Get opponent info
    const opponentId = fight.p1Id === userId ? fight.p2Id : fight.p1Id;
    const opponent = await ctx.client.users.fetch(opponentId);

    // Create status embed
    const embed = new Embed()
      .setTitle(`⚔️ Fight Status - Round ${fight.currentRound}`)
      .setColor(0x800080);

    // HP bars
    const p1User = await ctx.client.users.fetch(fight.p1Id);
    const p2User = await ctx.client.users.fetch(fight.p2Id);
    const p1Name = p1User?.username ?? "Player 1";
    const p2Name = p2User?.username ?? "Player 2";

    const userHpBar = HpBarRenderer.render({
      current: fight.p1Id === userId ? fight.p1Hp : fight.p2Hp,
      max: fight.p1Id === userId ? fight.p1MaxHp : fight.p2MaxHp,
      length: 10,
    });

    const opponentHpBar = HpBarRenderer.render({
      current: fight.p1Id === userId ? fight.p2Hp : fight.p1Hp,
      max: fight.p1Id === userId ? fight.p2MaxHp : fight.p1MaxHp,
      length: 10,
    });

    embed.addFields(
      { name: "You", value: userHpBar, inline: true },
      { name: opponent?.username ?? "Opponent", value: opponentHpBar, inline: true },
    );

    // Timeout info
    const lastAction = new Date(fight.lastActionAt).getTime();
    const timeoutSeconds = COMBAT_CONFIG.roundTimeoutSeconds;
    const expiresAt = lastAction + timeoutSeconds * 1000;
    const timeLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

    embed.addFields({
      name: "⏱️ Round Timeout",
      value: timeLeft > 0 ? `Action needed within **${timeLeft}s**` : "⚠️ Round is overdue!",
      inline: false
    });

    // Show round card if there was a previous round
    if (fight.lastRound) {
      const roundEmbed = buildRoundCard(
        fight.lastRound,
        p1Name,
        p2Name,
        fight.p1MaxHp,
        fight.p2MaxHp,
        fight.lastRound.roundNumber
      );
      // We can't really "nest" embeds well, but we can send them together or merge info.
      // The user said: "send Round Card + HP bars".
      // I'll merge the description of the round card into the status if it's the latest.
      embed.setDescription(`**Last Round Summary:**\n${roundEmbed.data.description}\n\n*Fight continues...*`);
    }

    // Show move buttons if active
    if (fight.status === "active") {
      const userPending = fight.p1Id === userId ? !fight.p1PendingMove : !fight.p2PendingMove;

      if (userPending) {
        embed.setFooter({ text: "⏳ Waiting for your move..." });

        const attackBtn = createButton({
          customId: `fight_move_${fight.fightId}_${userId}_attack`,
          label: "⚔️ Attack",
          style: ButtonStyle.Primary,
        });

        const blockBtn = createButton({
          customId: `fight_move_${fight.fightId}_${userId}_block`,
          label: "🛡️ Block",
          style: ButtonStyle.Secondary,
        });

        const critBtn = createButton({
          customId: `fight_move_${fight.fightId}_${userId}_crit`,
          label: "💥 Critical",
          style: ButtonStyle.Danger,
        });

        const row = new ActionRow<typeof attackBtn>().addComponents(attackBtn, blockBtn, critBtn);

        await ctx.editOrReply({ embeds: [embed], components: [row], flags: 64 });
        return;
      } else {
        const opponentPending = fight.p1Id === userId ? !fight.p2PendingMove : !fight.p1PendingMove;
        embed.setFooter({
          text: opponentPending ? "✅ Move submitted! Waiting for opponent..." : "🔄 Both moves in! Processing..."
        });
      }
    }

    await ctx.editOrReply({ embeds: [embed], flags: 64 });
  }

  private async forfeit(ctx: GuildCommandContext, userId: string) {
    const profileResult = await rpgProfileRepo.findById(userId);
    if (profileResult.isErr() || !profileResult.unwrap()?.isFighting) {
      await replyEphemeral(ctx, { content: "❌ You are not in a fight." });
      return;
    }

    const fightId = profileResult.unwrap()!.activeFightId;
    if (!fightId) {
      await replyEphemeral(ctx, { content: "❌ Could not find your active fight." });
      return;
    }

    const result = await rpgFightService.forfeit(fightId, userId);

    if (result.isErr()) {
      await replyEphemeral(ctx, { content: `❌ ${result.error.message}` });
      return;
    }

    await ctx.editOrReply({ content: "🏳️ You have forfeited the fight." });
  }
}




