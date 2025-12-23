# Arquitectura de Eventos (Event Bus)

El bot implementa una arquitectura de eventos en capas diseñada para desacoplar la librería de Discord (Seyfert) de la lógica de negocio. Esto permite activar, desactivar o probar componentes de forma aislada sin modificar el "cabeadeo" principal del bot.

## El Patrón: Handler -> Hook -> Listener

El flujo de un evento sigue siempre este camino unidireccional:

### 1. Handler (`src/events/handlers/*`)

_El Puente._

- Es el punto de entrada que conoce Seyfert.
- **Responsabilidad Única**: Recibir el evento crudo del cliente y pasarlo al Hook correspondiente.
- No contiene lógica de negocio.
- Ejemplo: Recibe `messageCreate` y llama a `messageCreateHook.emit(message)`.

### 2. Hook (`src/events/hooks/*`)

_El Bus._

- Son instancias de un emisor de eventos ligero (`createEventHook`).
- Viven en memoria y son agnósticos a la librería de Discord.
- Actúan como punto de anclaje para que múltiples sistemas se suscriban al mismo evento sin conocerse entre sí.

### 3. Listener (`src/events/listeners/*`)

_La Lógica._

- Son funciones que se suscriben a un Hook para ejecutar una tarea específica.
- Cada archivo suele representar una "feature" o responsabilidad única.
- Ejemplos:
  - `moderationLogs.ts` escucha `messageDeleteHook` para loguear borrados.
  - `automod.ts` escucha `messageCreateHook` para filtrar spam.

## Por qué usar Hooks?

1.  **Aislamiento**: Si mañana cambiamos de librería de Discord, solo hay que reescribir los _Handlers_. Los _Listeners_ (la lógica de negocio real) permanecen intactos porque se suscriben al Hook, no al cliente.
2.  **Seguridad**: Un error en un listener (ej. fallo al guardar en DB) no rompe el manejo del evento para otros listeners, ya que el Hook gestiona la ejecución segura.
3.  **Modularidad**: Podemos tener 10 listeners diferentes para `messageCreate` (XP, Logs, AutoMod, Comandos, etc.) en archivos separados, en lugar de un archivo gigante con múltiples `if/else`.

## Guía: Añadir un Nuevo Listener

Para agregar una nueva funcionalidad que reaccione a un evento (ej. dar XP por mensaje):

1.  Busca el Hook correspondiente en `src/events/hooks` (ej. `messageCreateHook`).
2.  Crea un nuevo archivo en `src/events/listeners` (ej. `xpSystem.ts`).
3.  Importa el Hook y suscríbete:

    ```typescript
    import { messageCreateHook } from "../hooks/messageCreate";

    messageCreateHook.listen(async (message) => {
      // Tu lógica aquí
      if (message.author.bot) return;
      await giveXp(message.author.id);
    });
    ```

4.  ¡Listo! No necesitas registrar nada manualmente en el cliente; el archivo se carga automáticamente al iniciarse el bot (siempre que se importe en el índice de listeners).
