/**
 * Set Work Bonus Mode Command.
 *
 * Purpose: Admin command to set bonus scale mode (flat | percent) for /work.
 * Audited as config_update with before/after and correlationId.
 */
import {
    Declare,
    Options,
    SubCommand,
    type GuildCommandContext,
    createStringOption,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { checkEconomyPermission } from "@/modules/economy/permissions";
import { guildEconomyRepo, economyAuditRepo } from "@/modules/economy";

const options = {
    mode: createStringOption({
        description: "Bonus scale mode",
        required: true,
        choices: [
            { name: "Flat", value: "flat" },
            { name: "Percent", value: "percent" },
        ],
    }),
};

@Declare({
    name: "set-work-bonus-mode",
    description: "Set bonus scale mode for /work (flat or percent)",
})
@Options(options)
export default class EconomyConfigSetWorkBonusModeCommand extends SubCommand {
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
                content: "You need admin permission to set work bonus mode.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const mode = ctx.options.mode as "flat" | "percent";
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
            workBonusScaleMode: mode,
        });
        if (updateResult.isErr()) {
            await ctx.write({
                content: "Failed to update work bonus mode.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await economyAuditRepo.create({
            operationType: "config_update",
            guildId,
            actorId: ctx.author.id,
            targetId: ctx.author.id,
            source: "set-work-bonus-mode",
            reason: "Set work bonus mode",
            metadata: {
                field: "workBonusScaleMode",
                before: before.work.workBonusScaleMode,
                after: mode,
                correlationId: ctx.interaction.id,
            },
        });

        await ctx.write({
            content: `Work bonus scale mode set to **${mode}**.`,
            flags: MessageFlags.Ephemeral,
        });
    }
}
