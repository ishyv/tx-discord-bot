/**
 * Provides contextual help for admins tweaking autorole rules.
 * Keeping it as a command avoids relying on external docs while we iterate.
 */

import {
  Declare,
  Embed,
  SubCommand,
  type GuildCommandContext,
} from "seyfert";
import { EmbedColors } from "seyfert/lib/common";

import { requireAutoroleContext } from "./shared";

@Declare({
  name: "help",
  description: "Mostrar las opciones disponibles para las reglas de auto-role",
})
export default class AutoroleHelpCommand extends SubCommand {
  async run(ctx: GuildCommandContext) {
    const context = await requireAutoroleContext(ctx);
    if (!context) return;

    const embed = new Embed()
      .setColor(EmbedColors.Blue)
      .setTitle("Auto-role - triggers disponibles")
      .setDescription(
        [
          "Al crear una regla debes usar uno de los siguientes triggers exactos:",
          "",
          "**`onMessageReactAny`**",
          "- Otorga el rol a cualquiera que reaccione en cualquier mensaje del servidor.",
          "- Usalo con `duration` cuando sea posible para evitar acumular roles permanentes.",
          "",
          "**`onReactSpecific <messageId> <emoji>`**",
          "- Otorga el rol a quien reaccione con el emoji indicado en el mensaje indicado.",
          "- Usa IDs copiados en modo desarrollador y emojis en formato `:nombre:` o `<:nombre:id>`.",
          "- Las reglas permanentes revocan el rol cuando la reaccion se quita o se borra el mensaje.",
          "",
          "**`onAuthorReactionThreshold <emoji> <count>`**",
          "- Otorga el rol al autor del mensaje cuando el emoji alcanza el umbral solicitado.",
          "- Ejemplo: `onAuthorReactionThreshold :thumbsup: 10` asigna el rol al autor cuando llega a 10 reacciones.",
          "- El rol se retira si el contador baja por debajo del umbral.",
          "",
          "**`onReputationAtLeast <rep>`**",
          "- Otorga el rol cuando el usuario alcanza el puntaje de reputacion indicado.",
          "- Ejemplo: `onReputationAtLeast 40` otorga el rol desde 40 rep y lo revoca si baja de ese valor.",
          "- Configura un rol por cada rango de reputacion que necesites.",
          "",
          "Puedes anadir `duration` (por ejemplo `30m`, `1h`, `2d`, `1w`) para que la concesion sea temporal. Sin duracion, la regla sera live y dependera unicamente del trigger.",
        ].join("\n"),
      );

    await ctx.write({ embeds: [embed] });
  }
}
