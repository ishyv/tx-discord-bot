/**
 * Motivación: adaptar el evento "guild Role Delete" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";

import { emitGuildRoleDelete } from "@/events/hooks/guildRole";

export default createEvent({
  data: { name: "guildRoleDelete" },
  async run(role, client, shardId) {
    await emitGuildRoleDelete(role, client, shardId);
  },
});
