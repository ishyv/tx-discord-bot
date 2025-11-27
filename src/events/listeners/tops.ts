/**
 * Motivación: enganchar el sistema de TOPs a los eventos globales sin mezclar lógica de negocio con wiring.
 *
 * Idea/concepto: iniciar el scheduler al encender el bot y registrar actividad de mensajes conforme llegan.
 *
 * Alcance: listeners del sistema de TOPs; la lógica principal vive en `src/systems/tops`.
 */
import { onBotReady } from "@/events/hooks/botReady";
import { onMessageCreate } from "@/events/hooks/messageCreate";
import { recordMessageActivity, startTopsScheduler } from "@/systems/tops";

onBotReady(async (_user, client) => {
  startTopsScheduler(client as any);
});

onMessageCreate(async (message, client) => {
  await recordMessageActivity(client as any, message as any);
});
