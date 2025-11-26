/**
 * Motivación: adaptar el evento "message Delete Bulk" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";

import { emitMessageDeleteBulk } from "@/events/hooks/messageDelete";

export default createEvent({
  data: { name: "messageDeleteBulk" },
  async run(data, client, shardId) {
    await emitMessageDeleteBulk(data, client, shardId);
  },
});
