# Plan de Mejoras para AutoMod (Anti-Spam de Links)

## Objetivo
Extender AutoMod para mayor flexibilidad y precisión al detectar spam de links, sin romper el comportamiento actual.

## Fases y Tareas

### Fase 1: Whitelist de Dominios (por guild)
**Razón**: Reducir falsos positivos (YouTube, GitHub, etc.) y permitir que cada servidor defina dominios seguros.

#### Tareas
1. **Definir configuración de whitelist**
   - Archivo: `src/commands/automod/config.ts`
   - Agregar `automodDomainWhitelistConfig` con:
     - `enabled: boolean`
     - `domains: string[]` (ej. `["youtube.com", "github.com"]`)
   - Registrar en `ConfigurableModule.AutomodDomainWhitelist`.

2. **Comando para gestionar whitelist**
   - Archivo: `src/commands/automod/whitelist.command.ts`
   - Subcomandos: `add`, `remove`, `list`, `enable/disable`.
   - Validar formato de dominio (regex simple: `^[a-z0-9.-]+\.[a-z]{2,}$`).

3. **Integración en AutoModSystem**
   - Archivo: `src/systems/automod/index.ts`
   - En `runLinkSpamFilter`, antes de contar links, filtrar los que coincidan con la whitelist.
   - Loggear cuántos links fueron filtrados por whitelist.

4. **Tests**
   - Suite: `tests/db-tests/automod_whitelist.int.test.ts`
   - Verificar que links de dominios whitelisteados no cuenten.
   - Verificar que links no whitelisteados cuenten.

---

### Fase 2: Acciones Configurables (no solo timeout)
**Razón**: Permitir que cada servidor elija qué hacer al detectar spam (mute, ban, delete, reporte).

#### Tareas
1. **Extender configuración de link spam**
   - Archivo: `src/commands/automod/config.ts`
   - Agregar a `automodLinkSpamConfig`:
     - `action: "timeout" | "mute" | "delete" | "report"` (default: `timeout`)
     - `reportChannelId?: string` (si action=report)

2. **Refactorizar `runLinkSpamFilter`**
   - Archivo: `src/systems/automod/index.ts`
   - Según `action`, ejecutar la acción correspondiente.
   - Si `report`, enviar embed a `reportChannelId`.

3. **Actualizar comando `/automod linkspam`**
   - Archivo: `src/commands/automod/linkspam.command.ts`
   - Añadir opción `action` y `reportChannelId`.

4. **Tests**
   - Suite: `tests/db-tests/automod_actions.int.test.ts`
   - Simular cada acción.

---

### Fase 3: Detección de Acortadores (bit.ly, tinyurl, etc.)
**Razón**: Muchos spammers usan acortadores para ocultar dominios maliciosos.

#### Tareas
1. **Expandir `extractLinks`**
   - Archivo: `src/systems/automod/index.ts`
   - Detectar patrones conocidos: `bit.ly`, `tinyurl.com`, `t.co`, `cutt.ly`, etc.
   - Opcional: resolver la URL final (fetch HEAD) y aplicar whitelist/filtros.

2. **Configuración de acortadores**
   - Archivo: `src/commands/automod/config.ts`
   - `automodShortenerConfig`:
     - `enabled: boolean`
     - `resolveFinalUrl: boolean` (default: false)
     - `allowedShorteners: string[]` (opcional whitelist de acortadores)

3. **Tests**
   - Suite: `tests/db-tests/automod_shorteners.int.test.ts`
   - Simular mensajes con acortadores.

---

### Fase 4: Reporte en Canal (logs centralizados)
**Razón**: Facilitar revisión de spam detectado por el staff.

#### Tareas
1. **Extender `logModerationAction` o crear helper**
   - Archivo: `src/utils/moderationLogger.ts`
   - Soporte para enviar embed a un canal específico.

2. **Comando para configurar canal de reportes**
   - Archivo: `src/commands/automod/report-channel.command.ts`
   - Guardar `reportChannelId` en la configuración de AutoMod.

3. **Integrar en AutoModSystem**
   - Cuando se detecta spam y `action=report`, enviar embed al canal configurado.

4. **Tests**
   - Suite: `tests/db-tests/automod_report.int.test.ts`
   - Verificar que el embed se envíe al canal correcto.

---

## Archivos a Crear/Modificar

### Nuevos
- `src/commands/automod/whitelist.command.ts`
- `src/commands/automod/report-channel.command.ts`
- `tests/db-tests/automod_whitelist.int.test.ts`
- `tests/db-tests/automod_actions.int.test.ts`
- `tests/db-tests/automod_shorteners.int.test.ts`
- `tests/db-tests/automod_report.int.test.ts`

### Modificar
- `src/commands/automod/config.ts` (nuevas configs)
- `src/commands/automod/linkspam.command.ts` (opción action)
- `src/systems/automod/index.ts` (lógica de whitelist, acciones, acortadores)
- `src/utils/moderationLogger.ts` (opcional: helper de canal)
- `src/configuration/constants.ts` (nuevos ConfigurableModule)

---

## Orden de Implementación Sugerido
1. **Fase 1** (Whitelist) → menor riesgo, mejora inmediata.
2. **Fase 2** (Acciones) → flexibilidad sin romper.
3. **Fase 4** (Reporte) → visibilidad para staff.
4. **Fase 3** (Acortadores) → opcional, más complejo.

---

## Validación
- **Tests unitarios**: cada suite debe cubrir happy path y edge cases.
- **Tests de integración**: usar `bun run test-db` para asegurar que no rompemos nada.
- **Manual**: probar en servidor de pruebas con mensajes de ejemplo.

---

## Notas
- Mantener compatibilidad con configuraciones existentes (defaults).
- No activar nuevas funcionalidades por defecto para evitar sorpresas.
- Documentar cambios en `/automod help` o similar.
