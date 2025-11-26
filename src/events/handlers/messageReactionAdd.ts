/**
 * Motivación: adaptar el evento "message Reaction Add" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";
import { emitMessageReactionAdd } from "@/events/hooks/messageReaction";

/**
 * Despacha el evento `messageReactionAdd` de Seyfert a todos los listeners registrados.
 */
export default createEvent({
  data: { name: "messageReactionAdd" },
  async run(message, client, shardId) {
    await emitMessageReactionAdd(message, client, shardId);
  },
});
