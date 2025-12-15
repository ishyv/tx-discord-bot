# Operaciones de comunidad

Tres flujos clave orientados a la interacción con miembros: tickets de soporte, ofertas y reportes periódicos de actividad (TOPs). Esta guía explica su intención, dependencias y puntos de extensión.

## Tickets

- Lógica central en `src/systems/tickets/index.ts`; se activa desde el listener `src/events/hooks/botReady.ts` a través de `ensureTicketMessage` y por el comando de configuración `src/commands/moderation/tickets/config.command.ts`. Requiere que `Features.Tickets` esté habilitada.
- El sistema mantiene un mensaje fijo con selector de categorías en el canal `channels.core.tickets`. Si el bot no encuentra el mensaje o hay residuos, los limpia y recrea para asegurar una única puerta de entrada.
- Al crear un ticket: valida que el usuario no tenga más de `MAX_TICKETS_PER_USER`, crea el canal en la categoría configurada (`channels.core.ticketCategory`), registra el canal en `guild.pendingTickets` y en `users.openTickets`. Los embeds iniciales incluyen la razón y un botón de cierre.
- Racional: reducir fricción para los usuarios (categorías predefinidas) y para el staff (listado centralizado de tickets abiertos en DB), evitando que los canales de tickets queden huérfanos si se borra el mensaje original.

## Ofertas (review workflow)

- Servicio de dominio en `src/modules/offers/service.ts` con tipos en `src/modules/offers/types.ts` y UI en `modules/offers/embeds.ts`. Los comandos viven en `src/commands/offers/*.ts`.
- Flujo: el autor envía la oferta -> se crea un mensaje en el canal de revisión configurado (`channels.core.offersReview`) -> moderadores aprueban, piden cambios o rechazan. Las aprobadas se publican en `channels.core.approvedOffers`; todas las transiciones se loguean con `logModerationAction`.
- La persistencia está en `src/db/schemas/offers.ts` y repositorio `src/db/repositories/offers.ts`, que impone unicidad de oferta activa por autor y estados permitidos por transición. El servicio usa un `Result` explícito para forzar a los comandos a manejar errores de negocio.
- Racional: separar la UI de los estados del dominio, mantener trazabilidad (último moderador, nota de cambio/rechazo) y evitar ofertas duplicadas de un mismo usuario mientras otra está activa.

## Autoroles

- Dominio definido en `src/modules/autorole` (tipos, validadores, caché) con persistencia en `src/db/repositories/autorole.ts`. Los comandos de gestión están en `src/commands/moderation/autorole/*.ts` y dependen de `Features.Autoroles`.
- Tipos de disparadores soportados incluyen umbrales de reputación y antigüedad, reacciones y otros eventos. El servicio `src/systems/autorole/service.ts` sincroniza roles cuando cambia la reputación o al evaluar la antigüedad de un miembro. `scheduler.ts` gestiona expiraciones de grants temporales para roles con duración.
- Las reglas se cachean por guild para evitar lecturas constantes a DB y se guardan razones de grant/revoke (`autorole:<rule>:...`) en cada acción para auditar o revertir rápidamente.
- Racional: automatizar asignaciones repetitivas sin depender de bots externos, permitir presets/revokes consistentes y mantener una fuente única de verdad de cuándo y por qué se asignó un rol.

## TOPs (estadísticas periódicas)

- Sistema en `src/systems/tops/index.ts` con scheduler iniciado en `src/events/listeners/tops.ts`. Se apoya en el repo `src/db/repositories/tops.ts` para leer/escribir la ventana activa y el historial de reportes.
- Métricas recolectadas: conteo de emojis y actividad por canal a partir de `messageCreate`, y delta de reputación via `recordReputationChange` cuando otros módulos le reportan cambios. Solo procesa si hay una ventana activa con canal configurado.
- Cada intervalo (`intervalMs` configurable) el scheduler envía un embed al canal configurado con el top de emojis, canales y reputación, luego persiste un snapshot y reinicia contadores. Usa `findDueWindows` para ejecutar solo cuando corresponde y evitar trabajo en vano.
- Racional: ofrecer transparencia sobre actividad sin depender de comandos manuales, y mantener un historial inmutable de periodos para análisis posterior sin sobrecargar la base con contadores infinitos.
