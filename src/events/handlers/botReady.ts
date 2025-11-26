/**
 * Motivación: adaptar el evento "bot Ready" de Seyfert para reenviarlo a los hooks internos del bot.
 *
 * Idea/concepto: registra el evento con createEvent y delega la ejecución a los hooks tipados que agregan listeners.
 *
 * Alcance: puente entre Seyfert y el sistema de hooks; no implementa la lógica del evento en sí.
 */
import { createEvent } from "seyfert";
import { emitBotReady } from "./../hooks/botReady";

/**
 * Despacha el evento `botReady` de Seyfert a todos los listeners registrados.
 */
export default createEvent({
  data: { name: "botReady" },
  async run(user, client) {
    client.logger.info(`${user.username} encendido!`);
    await emitBotReady(user, client);
  },
});
