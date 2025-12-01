/**
 * Motivación: encapsular la reacción al evento "clean Tickets Channe" para mantener la lógica en un módulo autocontenido.
 *
 * Idea/concepto: se suscribe a los hooks correspondientes y coordina servicios o sistemas que deben ejecutarse.
 *
 * Alcance: orquesta el flujo específico del listener; no define el hook ni registra el evento base.
 */
import { ensureTicketMessage } from "@/systems/tickets";
import { onBotReady } from "@/events/hooks/botReady";

onBotReady((_, client) => {
    ensureTicketMessage(client).catch((err) => {
        console.error("[tickets] failed to ensure ticket message", {
            error: err,
        });
    });
});