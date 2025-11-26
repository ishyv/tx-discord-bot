/**
 * Motivación: adaptar el evento "message Create" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";
import { emitMessageCreate } from "@/events/hooks/messageCreate";

/**
 * Despacha el evento `messageCreate` de Seyfert a todos los listeners registrados.
 */
export default createEvent({
  data: { name: "messageCreate" },
  async run(message, client, shardId) {
    await emitMessageCreate(message, client, shardId);
  },
});
