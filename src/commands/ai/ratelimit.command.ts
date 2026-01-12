/**
 * Motivacion: configurar el rate limit de IA por guild.
 * 
 * Idea/concepto: subcomandos para habilitar, deshabilitar, configurar y mostrar el rate limit actual.
 * 
 * Alcance: maneja la interfaz de configuración del usuario; delega la validación de consumo al servicio de rate limit.
 */
import { Options, SubCommand, createBooleanOption, createIntegerOption, Middlewares } from "seyfert";
import type { GuildCommandContext } from "seyfert";
import { configStore, ConfigurableModule } from "@/configuration";
import { Guard } from "@/middlewares/guards/decorator";

const options = {
    enabled: createBooleanOption({
        description: "Habilitar o deshabilitar el rate limit",
        required: false,
    }),
    max: createIntegerOption({
        description: "Maximo de solicitudes permitidas",
        required: false,
        min_value: 1,
    }),
    window: createIntegerOption({
        description: "Ventana de tiempo en segundos",
        required: false,
        min_value: 10,
    }),
};

@Options(options)
@Guard({
    guildOnly: true,
})
@Middlewares(["guard"])
export default class AiRateLimitCommand extends SubCommand {
    async run(ctx: GuildCommandContext<typeof options>) {
        const guildId = ctx.guildId;

        const { enabled, max, window } = ctx.options;

        // Si no se pasan opciones, mostramos la config actual
        if (enabled === undefined && max === undefined && window === undefined) {
            const config = await configStore.get(guildId, ConfigurableModule.AI);
            await ctx.write({
                content: `**Configuracion de Rate Limit de IA:**\n` +
                    `- Estado: ${config.rateLimitEnabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
                    `- Maximo: \`${config.rateLimitMax}\` solicitudes\n` +
                    `- Ventana: \`${config.rateLimitWindow}\` segundos`
            });
            return;
        }

        const current = await configStore.get(guildId, ConfigurableModule.AI);

        const updates: Partial<typeof current> = {};
        if (enabled !== undefined) updates.rateLimitEnabled = enabled;
        if (max !== undefined) updates.rateLimitMax = max;
        if (window !== undefined) updates.rateLimitWindow = window;

        await configStore.set(guildId, ConfigurableModule.AI, updates);

        const updated = await configStore.get(guildId, ConfigurableModule.AI);

        await ctx.write({
            content: `**Configuracion de Rate Limit actualizada:**\n` +
                `- Estado: ${updated.rateLimitEnabled ? "✅ Habilitado" : "❌ Deshabilitado"}\n` +
                `- Maximo: \`${updated.rateLimitMax}\` solicitudes\n` +
                `- Ventana: \`${updated.rateLimitWindow}\` segundos`
        });
    }
}
