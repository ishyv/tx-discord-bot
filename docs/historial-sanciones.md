# Historial de Sanciones (Sistema de Casos)

Este documento describe el funcionamiento, alcance y propósito del sistema de historial de sanciones (o "casos") implementado para la gestión de moderación.

## Propósito (¿Por qué?)

El sistema de casos nace de la necesidad de tener un registro centralizado y persistente de las acciones disciplinarias tomadas contra un usuario **dentro de un servidor específico**.

A diferencia de los comandos de moderación estándar (que ejecutan la acción pero a menudo no dejan un registro fácilmente consultable por el staff), el sistema de casos:

1.  **Aporta Contexto**: Permite a cualquier moderador ver rápidamente si un usuario es un "ofensor recurrente".
2.  **Unifica Criterios**: Agrupa sanciones de distinto tipo (Ban, Kick, Mute, Warn) bajo un mismo formato.
3.  **Facilita la Auditoría**: Provee una fuente de verdad para revisiones de apelaciones o reportes.

## Alcance (Scope)

El sistema registra automáticamente las siguientes acciones de moderación:

- **BAN**: Bloqueos definitivos del servidor.
- **KICK**: Expulsiones del servidor.
- **TIMEOUT**: Silencios temporales (Mutes).
- **WARN**: Advertencias formales.

> [!NOTE]
> El historial es **per-guild**. Esto significa que los casos registrados en el Servidor A no serán visibles ni afectarán la reputación del usuario en el Servidor B, respetando la privacidad y autonomía de cada comunidad.

## Funcionamiento Técnico (¿Cómo?)

### 1. Estructura de Datos

Los casos se almacenan directamente en el documento del usuario en la base de datos (MongoDB) bajo el campo `sanction_history`, el cual es un objeto indexado por la ID del servidor.

```typescript
// En user.ts (Schema)
sanction_history: {
  "id_del_servidor": [
    {
      type: "BAN" | "KICK" | "TIMEOUT" | "WARN",
      description: "Razón de la sanción",
      date: "ISOString"
    }
  ]
}
```

### 2. Función Centralizada: `registerCase`

Para garantizar que todos los comandos registren los datos de la misma forma, se utiliza la función `registerCase` ubicada en `src/db/repositories/users.ts`.

- **Responsabilidad**: Realizar un `$push` atómico al array de casos del servidor correspondiente.
- **Atomización**: Utiliza notación de punto (`sanction_history.guildId`) para evitar traer todo el documento a memoria, lo que asegura rendimiento y consistencia ante escrituras concurrentes.

### 3. Integración Directa

Los comandos de moderación (`ban.ts`, `kick.ts`, `mute.ts` y `warn add`) llaman a `registerCase` inmediatamente después de que la acción de Discord se haya completado con éxito.

### 4. Consulta vía `/cases`

El comando `/cases [user]` permite recuperar y visualizar el historial:

- Si se especifica un `user`, muestra sus casos en el servidor actual.
- Si no se especifica, el usuario puede ver su propio historial en ese servidor.
- Muestra los últimos 15 casos en orden cronológico inverso (el más reciente primero).

## Mantenibilidad

El sistema está diseñado siguiendo el **Patrón Repositorio** y validado por **Zod**, lo que significa que añadir un nuevo tipo de sanción o campos adicionales (ej. ID del moderador) requiere cambios mínimos y centralizados en el esquema y repositorio del usuario.
