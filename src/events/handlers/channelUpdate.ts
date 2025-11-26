/**
 * Motivación: adaptar el evento "channel Update" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";

import { emitChannelUpdate } from "@/events/hooks/channelEvents";

export default createEvent({
  data: { name: "channelUpdate" },
  async run(...args) {
    await emitChannelUpdate(...args);
  },
});
