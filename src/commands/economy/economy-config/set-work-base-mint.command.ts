/**
 * Set Work Base Mint Command.
 *
 * Purpose: Admin command to set minted base reward (always paid) for /work.
 * Audited as config_update with before/after and correlationId.
 */
import {
    Declare,
    Options,
    SubCommand,
    type GuildCommandContext,
    createIntegerOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const options = {
    amount: createIntegerOption({
        description: "Minted base reward (always paid) (>= 0)",
        required: true,
        min_value: 0,
    }),
};

@Declare({
    name: "set-work-base-mint",
    description: "Set minted base reward (always paid) for /work",
})
@Options(options)
export default class EconomyConfigSetWorkBaseMintCommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const guildId = ctx.guildId;
        if (!guildId) {
            await ctx.write({
                content: "This command can only be used in a server.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const { EconomyPermissionLevel } = await import(
            "@/modules/economy/permissions"
        );
        const isAdmin = await checkEconomyPermission(
            ctx.member,
            EconomyPermissionLevel.ADMIN,
        );
        if (!isAdmin) {
            await ctx.write({
                content: "You need admin permission to set work base mint.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const amount = Number(ctx.options.amount);
        const configResult = await guildEconomyRepo.ensure(guildId);
        if (configResult.isErr()) {
            await ctx.write({
                content: "Failed to load economy config.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const before = configResult.unwrap();

        const updateResult = await guildEconomyRepo.updateWorkConfig(guildId, {
            workBaseMintReward: amount,
        });
        if (updateResult.isErr()) {
            await ctx.write({
                content: "Failed to update work base mint reward.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await economyAuditRepo.create({
            operationType: "config_update",
            guildId,
            actorId: ctx.author.id,
            targetId: ctx.author.id,
            source: "set-work-base-mint",
            reason: "Set work base mint",
            metadata: {
                field: "workBaseMintReward",
                before: before.work.workBaseMintReward,
                after: amount,
                correlationId: ctx.interaction.id,
            },
        });

        await ctx.write({
            content: `Work base mint reward set to **${amount}**.`,
            flags: MessageFlags.Ephemeral,
        });
    }
}
