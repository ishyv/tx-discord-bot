# Arquitectura del bot

Fotografía de cómo están orquestadas las piezas principales del runtime. Esta guía busca aclarar _por qué_ se eligieron ciertos patrones y dónde encontrar cada responsabilidad, sin repetir el código.

## Puntos de entrada y ciclo de vida

- `src/index.ts` es el arranque único: carga augmentations de UI antes que nada, extiende el contexto de Seyfert con helpers de logging, aplica middlewares globales y arranca la conexión Mongo (`getDb()`) antes de inicializar el cliente. Al finalizar, sube los comandos con `uploadCommands` usando el `commands.json` cacheado.
- Los _handlers_ de eventos en `src/events/handlers/*.ts` actúan como puente entre el gateway de Seyfert y los hooks internos. Cada handler solo recibe el evento y re-emite a los hooks tipados para mantener el código de negocio desacoplado del framework.
- Los _hooks_ en `src/events/hooks/*.ts` son pequeños buses en memoria creados con `createEventHook.ts`. Permiten que cualquier módulo registre listeners o los quite sin tocar el wiring de Seyfert.
- Los _listeners_ en `src/events/listeners/*.ts` contienen la lógica de negocio por evento (logs, automod, reputación, tops, etc.) y se auto-registran importando el hook correspondiente. Esta separación facilita probar o desactivar listeners sin tocar el transporte del evento.

## Capas y convenciones

- **Comandos y componentes** viven en `src/commands` y `src/components` respectivamente. El objetivo es que cada comando sea sólo envoltorio de UI/validación y delegue la regla de negocio a módulos o sistemas dedicados.
- **Módulos** (`src/modules/*`) agrupan utilidades reutilizables por dominio (economía, autoroles, UI, cooldowns, features, etc.). Son diseñados para ser referenciados tanto por comandos como por sistemas, evitando duplicar parsing/validación.
- **Sistemas** (`src/systems/*`) encapsulan flujos de negocio completos y orquestan varios módulos/repositorios (tickets, tops, automod). Se invocan desde listeners o comandos pero mantienen su propio estado/scheduler cuando es necesario.
- **Servicios** (`src/services/*`) integran con dependencias externas (OCR, IA) y son consumidos por sistemas o listeners, manteniendo el I/O aislado del resto del dominio.

## Contexto y middlewares

- El contexto extendido en `src/index.ts` agrega `getGuildLogger()` para construir loggers por guild sin reconfigurar en cada comando.
- Los middlewares globales se registran en `src/middlewares/index.ts` para que todo comando pase por el mismo pipeline (enfriamiento, límites de moderación y banderas de features). El diseño busca que las políticas transversales no se olviden en comandos individuales.

## UI y sesiones

- `src/modules/ui` contiene capas finas sobre Seyfert para construir embeds, filas y sesiones stateful con señales/almacenamientos efímeros. El objetivo es evitar reimplementar manejo de interacciones en cada comando complejo (p.ej. diseñador de embeds, paginaciones).
- Los _components handlers_ en `src/components/*.ts` son la entrada de botones y select menus. Están desacoplados del comando que los creó y delegan en `modules/ui` o en sistemas según corresponda.

## Flujo de datos

- Los repositorios de datos (`src/db/repositories/*`) son la frontera con Mongo. Los módulos/sistemas los consumen en vez de usar modelos directos para mantener reglas de dominio y normalización en un solo lugar.
- Las formas de datos viven en esquemas Zod (`src/db/schemas/*`). Los repos validan lecturas/escrituras con esos esquemas, aplican defaults y devuelven POJOs ya normalizados; no hay fixers ni modelos mágicos.

## Filosofía general

- El proyecto privilegia **delegar la lógica de negocio** a módulos/sistemas dedicados y mantener comandos/listeners como coordinadores delgadas.
- La separación handler -> hook -> listener permite **activar/desactivar features** sin tocar el resto del código y facilita aislar pruebas.
- Las dependencias cruzadas se resuelven por importaciones explícitas y cachés de corta vida (features, canales, cooldowns) para reducir llamadas a la base sin mantener estados globales complejos.
