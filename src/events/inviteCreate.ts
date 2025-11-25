/**
 * Motivación: adaptar el evento "invite Create" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";

import { emitInviteCreate } from "@/events/hooks/inviteEvents";

export default createEvent({
  data: { name: "inviteCreate" },
  async run(...args) {
    await emitInviteCreate(...args);
  },
});
