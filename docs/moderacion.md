# Moderación y Reputación

Marco de diseño para los sistemas de protección del servidor y gestión disciplinaria.

## AutoMod

- **Filosofía**: Actuar en tiempo real sobre contenido malicioso sin bloquear la ejecución principal del bot.
- **Detección**: Utiliza un pipeline que combina filtros rápidos de texto para spam y estafas comunes, junto con análisis de imágenes mediante OCR para detectar estafas visuales.
- **Optimización**: Emplea técnicas de hash para recordar imágenes ya procesadas y minimizar el uso de recursos costosos.
- **Staff-Centric**: En lugar de borrar contenido silenciosamente de forma agresiva, el sistema prioriza alertar al equipo de moderación mediante canales de log dedicados, permitiendo una intervención humana informada.

- **Trazabilidad**: Cada advertencia incluye metadatos sobre el moderador, el motivo y un identificador único para su gestión o apelación.

## Historial de Sanciones (Casos)

- **Propósito**: Proporcionar un registro unificado y persistente de todas las acciones disciplinarias (Bans, Kicks, Mutes, Warns) por servidor.
- **Acceso**: Consultable mediante el comando `/cases`, permitiendo al staff revisar antecedentes de forma rápida.
- **Detalle Técnico**: Para profundizar en su arquitectura y funcionamiento, ver [Historial de Sanciones](./historial-sanciones.md).

## Sistema de Reputación

- **Detección Automática**: El bot puede identificar comportamientos merecedores de reputación (basado en palabras clave o ayuda detectada) y emitir solicitudes de revisión.
- **Validación Humana**: Para evitar el abuso y el spam, las solicitudes automáticas deben ser confirmadas por el staff.
- **Comandos Manuales**: Permite la gestión directa de puntos de reputación por parte de los usuarios y moderadores autorizados.

## Límites y Overrides

- **Políticas de Rol**: El sistema permite definir permisos específicos por rol que sobresalen a los permisos nativos de Discord.
- **Control de Abuso**: Implementa ventanas de tiempo y cuotas máximas de acciones para prevenir que incluso usuarios con permisos realicen acciones masivas dañinas o accidentales.

## Auditoría y Logs

- **Centralización**: Todas las acciones de moderación, cambios en mensajes y eventos de voz se canalizan a través de un sistema de logging unificado.
- **Desacoplamiento**: Los logs se disparan de forma independiente a la lógica del comando, asegurando que siempre quede un registro sin importar cómo se ejecutó la acción.
