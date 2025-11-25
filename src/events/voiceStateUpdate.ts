/**
 * Motivación: adaptar el evento "voice State Update" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";

import { emitVoiceStateUpdate } from "@/events/hooks/voiceState";

export default createEvent({
  data: { name: "voiceStateUpdate" },
  async run(...args) {
    await emitVoiceStateUpdate(...args);
  },
});
