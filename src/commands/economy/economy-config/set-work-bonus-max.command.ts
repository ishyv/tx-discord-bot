/**
 * Set Work Bonus Max Command.
 *
 * Purpose: Admin command to set max bonus funded by treasury for /work.
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
        description: "Max treasury bonus (>= 0)",
        required: true,
        min_value: 0,
    }),
};

@Declare({
    name: "set-work-bonus-max",
    description: "Set max bonus from guild treasury for /work",
})
@Options(options)
export default class EconomyConfigSetWorkBonusMaxCommand extends SubCommand {
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
                content: "You need admin permission to set work bonus max.",
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
            workBonusFromWorksMax: amount,
        });
        if (updateResult.isErr()) {
            await ctx.write({
                content: "Failed to update work bonus max.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await economyAuditRepo.create({
            operationType: "config_update",
            guildId,
            actorId: ctx.author.id,
            targetId: ctx.author.id,
            source: "set-work-bonus-max",
            reason: "Set work bonus max",
            metadata: {
                field: "workBonusFromWorksMax",
                before: before.work.workBonusFromWorksMax,
                after: amount,
                correlationId: ctx.interaction.id,
            },
        });

        await ctx.write({
            content: `Work bonus max set to **${amount}**.`,
            flags: MessageFlags.Ephemeral,
        });
    }
}
