/**
 * AutoMod Event Listener: Activación del sistema de moderación automática.
 *
 * Propósito: Disparar el análisis AutoMod en cada mensaje de usuario
 * cuando la función está habilitada para el guild específico.
 *
 * Encaje en el sistema: Primer eslabón de la cadena AutoMod.
 * Conecta eventos de Discord con AutoModSystem.getInstance().analyzeUserMessage().
 *
 * Flujo de activación (orden crítico):
 *   1. Filtrar bots (solo usuarios reales)
 *   2. Verificar guildId disponible
 *   3. Consultar feature flag AutoMod para el guild
 *   4. Si habilitado, delegar a AutoModSystem para análisis completo
 *
 * Invariantes clave:
 *   - Solo procesa mensajes de usuarios no-bots
 *   - Respeta configuración por guild via feature flags
 *   - No maneja errores directamente (AutoModSystem tiene su propio error handling)
 *
 * Tradeoffs:
 *   - Early filtering: Reduce carga pero puede perder edge cases
 *   - Feature flag check: Evita procesamiento innecesario en guilds deshabilitados
 *
 * Riesgos conocidos:
 *   - Si isFeatureEnabled falla, AutoMod se deshabilita silenciosamente
 *   - GuildId nulo en mensajes DMs causa salida temprana
 *
 * Performance: Check rápido (feature flag) antes de procesamiento pesado.
 */
import { onMessageCreate } from "@/events/hooks/messageCreate";
import { AutoModSystem } from "@/systems/automod";
import { isFeatureEnabled, Features } from "@/modules/features";

/**
 * Listener principal: Analiza mensajes de usuarios para detección de contenido malicioso.
 *
 * Propósito: Punto de entrada del sistema AutoMod que filtra eventos
 * y delega el análisis completo al sistema centralizado.
 *
 * Comportamiento:
 *   - Ignora completamente mensajes de bots
 *   - Verifica disponibilidad de guildId (falla en DMs)
 *   - Consulta configuración AutoMod por guild
 *   - Delega análisis completo a AutoModSystem singleton
 *
 * @param message Mensaje de Discord recibido
 * @param client Instancia del bot de Seyfert
 *
 * Side effects:
 *   - Puede aplicar timeout a usuarios (via AutoModSystem)
 *   - Puede enviar notificaciones al staff
 *   - Puede escribir en caché persistente
 *
 * Invariantes:
 *   - Nunca lanza: Errores se manejan internamente
 *   - Solo procesa un mensaje a la vez (AutoModSystem maneja concurrencia)
 *   - Respeta completamente la configuración por guild
 *
 * RISK: Si el feature flag check falla, ningún mensaje será analizado
 *   hasta que se restaure la configuración del guild.
 */
onMessageCreate(async (message, client) => {
  if (message.author?.bot) {
    return;
  }

  const guildId = (message as any).guildId ?? message.member?.guildId;
  if (!guildId) return;

  const automodEnabled = await isFeatureEnabled(guildId, Features.Automod);
  if (!automodEnabled) return;

  await AutoModSystem.getInstance(client).analyzeUserMessage(message);
});
