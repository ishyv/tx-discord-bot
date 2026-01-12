/**
 * Middleware centralizado para validar precondiciones de comandos (Guards).
 */
import { createMiddleware } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { getGuardMetadata } from "./decorator";
import { collectMemberRoleIds, memberHasDiscordPermission, GUILD_ONLY_MESSAGE } from "@/utils/commandGuards";
import { resolveRoleActionPermission } from "@/modules/guild-roles";
import { isFeatureEnabled } from "@/modules/features";

const DEFAULT_PERMISSION_DENIED_MESSAGE = "[!] No tienes permisos suficientes para ejecutar este comando.";
const DEFAULT_OVERRIDE_DENIED_MESSAGE = "[!] Un override configurado en el bot bloquea este comando.";

export const guardMiddleware = createMiddleware<void>(async ({ context, next, stop }) => {
    const command = (context as any).command;
    const metadata = getGuardMetadata(command);

    // Si no hay metadata, seguimos
    if (!metadata) return next();

    // 1. Validar GuildOnly
    if (metadata.guildOnly && !context.guildId) {
        await context.write({
            content: GUILD_ONLY_MESSAGE,
            flags: MessageFlags.Ephemeral,
        });
        return stop("No guild context");
    }

    // Si no estamos en un guild, ya no podemos validar permisos de roles ni features
    if (!context.guildId) return next();
    const guildId = context.guildId;

    // 2. Validar Feature Toggle (si aplica)
    if (metadata.feature) {
        const enabled = await isFeatureEnabled(guildId, metadata.feature as any);
        if (!enabled) {
            await context.write({
                content: `Esta característica (\`${metadata.feature}\`) está deshabilitada en este servidor. Un administrador puede habilitarla desde el dashboard.`,
                flags: MessageFlags.Ephemeral,
            });
            return stop("Feature disabled");
        }
    }

    // 3. Resolver Permisos (Discord + Overrides)
    const permissions = metadata.permissions;
    const ctx = context as any;
    const actionKey = metadata.actionKey ?? ctx.fullCommandName ?? ctx.commandName ?? ctx.name;

    const member = context.member;
    const memberRoleIds = await collectMemberRoleIds(member);
    const hasDiscordPermission = await memberHasDiscordPermission(member, permissions);

    const decision = await resolveRoleActionPermission({
        guildId,
        actionKey: actionKey.toString().trim().toLowerCase().replace(/[\s-]+/g, "_"),
        memberRoleIds: [...memberRoleIds],
        hasDiscordPermission,
    });

    if (decision.allowed) {
        return next();
    }

    // 4. Respuesta de error estandarizada
    const message = decision.decision === "override-deny"
        ? DEFAULT_OVERRIDE_DENIED_MESSAGE
        : DEFAULT_PERMISSION_DENIED_MESSAGE;

    await context.write({
        content: message,
        flags: MessageFlags.Ephemeral,
    });

    return stop("Permission denied");
});
