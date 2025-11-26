/**
 * Motivación: encapsular el handler de componente "embed designer modal" para enrutar customId al sistema de UI sin duplicar filtros ni wiring.
 *
 * Idea/concepto: extiende las primitivas de Seyfert para componentes y delega en el registro de UI la resolución del callback adecuado.
 *
 * Alcance: filtra y despacha interacciones de este tipo; no define la lógica interna de cada componente ni su contenido visual.
 */
import { ModalCommand, type ModalContext } from "seyfert";
import { MessageFlags } from "seyfert/lib/types";
import { applyEmbedModalUpdate, getEmbedDesignerSession } from "@/modules/prefabs/embedDesigner";

export default class EmbedDesignerModalHandler extends ModalCommand {
  filter(ctx: ModalContext) {
    return ctx.customId.startsWith("embed:modal:");
  }

  async run(ctx: ModalContext) {
    const parts = ctx.customId.split(":");
    // format: embed:modal:<messageId>:<target>[ :<fieldKey> ]
    const messageId = parts[2];
    const action = parts.slice(3).join(":");
    if (!messageId || !action) return;

    const session = getEmbedDesignerSession(messageId);
    if (!session) {
      await ctx.write({
        content: "Esta edición expiró o no es válida.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const fields =
      ctx.interaction.components?.flatMap((row: any) => row.components ?? []) ?? [];
    const payload: Record<string, string | undefined> = {};
    for (const comp of fields) {
      if (comp?.customId) {
        payload[comp.customId] = comp.value;
      }
    }

    await applyEmbedModalUpdate(ctx as any, messageId, action as any, payload);
  }
}
