# Operaciones de comunidad

Tres flujos clave orientados a la interacci�n con miembros: tickets de soporte, ofertas y reportes peri�dicos de actividad (TOPs). Esta gu�a explica su intenci�n, dependencias y puntos de extensi�n.

## Tickets
- L�gica central en `src/systems/tickets/index.ts`; se activa desde el listener `src/events/hooks/botReady.ts` a trav�s de `ensureTicketMessage` y por el comando de configuraci�n `src/commands/moderation/tickets/config.command.ts`. Requiere que `Features.Tickets` est� habilitada.
- El sistema mantiene un mensaje fijo con selector de categor�as en el canal `channels.core.tickets`. Si el bot no encuentra el mensaje o hay residuos, los limpia y recrea para asegurar una �nica puerta de entrada.
- Al crear un ticket: valida que el usuario no tenga m�s de `MAX_TICKETS_PER_USER`, crea el canal en la categor�a configurada (`channels.core.ticketCategory`), registra el canal en `guild.pendingTickets` y en `users.openTickets`. Los embeds iniciales incluyen la raz�n y un bot�n de cierre.
- Racional: reducir fricci�n para los usuarios (categor�as predefinidas) y para el staff (listado centralizado de tickets abiertos en DB), evitando que los canales de tickets queden hu�rfanos si se borra el mensaje original.

## Ofertas (review workflow)
- Servicio de dominio en `src/modules/offers/service.ts` con tipos en `src/modules/offers/types.ts` y UI en `modules/offers/embeds.ts`. Los comandos viven en `src/commands/offers/*.ts`.
- Flujo: el autor env�a la oferta -> se crea un mensaje en el canal de revisi�n configurado (`channels.core.offersReview`) -> moderadores aprueban, piden cambios o rechazan. Las aprobadas se publican en `channels.core.approvedOffers`; todas las transiciones se loguean con `logModerationAction`.
- La persistencia est� en `src/db/models/offers.schema.ts` y repositorio `src/db/repositories/offers.ts`, que impone unicidad de oferta activa por autor y estados permitidos por transici�n. El servicio usa un `Result` expl�cito para forzar a los comandos a manejar errores de negocio.
- Racional: separar la UI de los estados del dominio, mantener trazabilidad (�ltimo moderador, nota de cambio/rechazo) y evitar ofertas duplicadas de un mismo usuario mientras otra est� activa.

## Autoroles
- Dominio definido en `src/modules/autorole` (tipos, validadores, cach�) con persistencia en `src/db/repositories/autorole.ts`. Los comandos de gesti�n est�n en `src/commands/moderation/autorole/*.ts` y dependen de `Features.Autoroles`.
- Tipos de disparadores soportados incluyen umbrales de reputaci�n y antig�edad, reacciones y otros eventos. El servicio `src/systems/autorole/service.ts` sincroniza roles cuando cambia la reputaci�n o al evaluar la antig�edad de un miembro. `scheduler.ts` gestiona expiraciones de grants temporales para roles con duraci�n.
- Las reglas se cachean por guild para evitar lecturas constantes a DB y se guardan razones de grant/revoke (`autorole:<rule>:...`) en cada acci�n para auditar o revertir r�pidamente.
- Racional: automatizar asignaciones repetitivas sin depender de bots externos, permitir presets/revokes consistentes y mantener una fuente �nica de verdad de cu�ndo y por qu� se asign� un rol.

## TOPs (estad�sticas peri�dicas)
- Sistema en `src/systems/tops/index.ts` con scheduler iniciado en `src/events/listeners/tops.ts`. Se apoya en el repo `src/db/repositories/tops.ts` para leer/escribir la ventana activa y el historial de reportes.
- M�tricas recolectadas: conteo de emojis y actividad por canal a partir de `messageCreate`, y delta de reputaci�n via `recordReputationChange` cuando otros m�dulos le reportan cambios. Solo procesa si hay una ventana activa con canal configurado.
- Cada intervalo (`intervalMs` configurable) el scheduler env�a un embed al canal configurado con el top de emojis, canales y reputaci�n, luego persiste un snapshot y reinicia contadores. Usa `findDueWindows` para ejecutar solo cuando corresponde y evitar trabajo en vano.
- Racional: ofrecer transparencia sobre actividad sin depender de comandos manuales, y mantener un historial inmutable de periodos para an�lisis posterior sin sobrecargar la base con contadores infinitos.
