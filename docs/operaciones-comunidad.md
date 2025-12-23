# Operaciones de Comunidad

Guía sobre los flujos de interacción con los miembros: tickets de soporte, ofertas de la comunidad y estadísticas de actividad (TOPs).

## Sistema de Tickets

- **Flujo**: Permite a los usuarios abrir canales de comunicación privada con el staff mediante un panel interactivo.
- **Categorización**: Soporta múltiples categorías (soporte técnico, reportes, dudas) que dirigen el ticket al personal adecuado.
- **Gestión Atómica**: El sistema asegura que cada usuario tenga un número limitado de tickets activos y que todos los canales queden registrados en la base de datos para evitar "canales huérfanos".
- **Limpieza**: Incluye lógica para cerrar y archivar tickets de forma automática o manual, manteniendo el servidor organizado.

## Gestión de Ofertas

- **Flujo de Revisión**: Las ofertas enviadas por los usuarios pasan por un proceso de curación. Los moderadores pueden aprobar, rechazar o solicitar cambios antes de que la oferta sea pública.
- **Estado del Dominio**: Cada oferta mantiene un estado (pendiente, aprobada, rechazada) y un historial de decisiones (quién la revisó y por qué).
- **Publicación Automática**: Una vez aprobada, el sistema se encarga de publicar la oferta en los canales correspondientes con un formato profesional y consistente.

## Autoroles Automáticos

- **Disparadores**: Asignación de roles basada en eventos automáticos como la antigüedad en el servidor, el nivel de reputación o la interacción con mensajes específicos (reacciones).
- **Temporalidad**: Soporta roles temporales que se retiran automáticamente tras un periodo definido, gestionado por un programador interno (scheduler).
- **Auditoría**: Cada asignación o retiro de rol queda registrado con su motivo, facilitando la supervisión del equipo de staff.

## Estadísticas y TOPs

- **Recolección de Datos**: Monitorea de forma pasiva la actividad (mensajes, emojis, reputación) para generar informes periódicos.
- **Ventanas de Tiempo**: Los datos se agrupan en periodos configurables (ej. semanalmente). Al finalizar el periodo, se genera un resumen visual y se reinician los contadores.
- **Transparencia**: Fomenta la participación comunitaria al destacar a los miembros y contenidos más activos de forma automatizada.
