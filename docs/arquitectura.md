# Arquitectura del bot

Fotograf�a de c�mo est�n orquestadas las piezas principales del runtime. Esta gu�a busca aclarar *por qu�* se eligieron ciertos patrones y d�nde encontrar cada responsabilidad, sin repetir el c�digo.

## Puntos de entrada y ciclo de vida
- `src/index.ts` es el arranque �nico: carga augmentations de UI antes que nada, extiende el contexto de Seyfert con helpers de logging, aplica middlewares globales y lanza `fixDb()` para normalizar la base antes de iniciar el cliente. Al finalizar, sube los comandos con `uploadCommands` usando el `commands.json` cacheado.
- Los *handlers* de eventos en `src/events/handlers/*.ts` act�an como puente entre el gateway de Seyfert y los hooks internos. Cada handler solo recibe el evento y re-emite a los hooks tipados para mantener el c�digo de negocio desacoplado del framework.
- Los *hooks* en `src/events/hooks/*.ts` son peque�os buses en memoria creados con `createEventHook.ts`. Permiten que cualquier m�dulo registre listeners o los quite sin tocar el wiring de Seyfert.
- Los *listeners* en `src/events/listeners/*.ts` contienen la l�gica de negocio por evento (logs, automod, reputaci�n, tops, etc.) y se auto-registran importando el hook correspondiente. Esta separaci�n facilita probar o desactivar listeners sin tocar el transporte del evento.

## Capas y convenciones
- **Comandos y componentes** viven en `src/commands` y `src/components` respectivamente. El objetivo es que cada comando sea s�lo envoltorio de UI/validaci�n y delegue la regla de negocio a m�dulos o sistemas dedicados.
- **M�dulos** (`src/modules/*`) agrupan utilidades reutilizables por dominio (econom�a, autoroles, UI, cooldowns, features, etc.). Son dise�ados para ser referenciados tanto por comandos como por sistemas, evitando duplicar parsing/validaci�n.
- **Sistemas** (`src/systems/*`) encapsulan flujos de negocio completos y orquestan varios m�dulos/repositorios (tickets, tops, automod). Se invocan desde listeners o comandos pero mantienen su propio estado/scheduler cuando es necesario.
- **Servicios** (`src/services/*`) integran con dependencias externas (OCR, IA) y son consumidos por sistemas o listeners, manteniendo el I/O aislado del resto del dominio.

## Contexto y middlewares
- El contexto extendido en `src/index.ts` agrega `getGuildLogger()` para construir loggers por guild sin reconfigurar en cada comando.
- Los middlewares globales se registran en `src/middlewares/index.ts` para que todo comando pase por el mismo pipeline (enfriamiento, l�mites de moderaci�n y banderas de features). El dise�o busca que las pol�ticas transversales no se olviden en comandos individuales.

## UI y sesiones
- `src/modules/ui` contiene capas finas sobre Seyfert para construir embeds, filas y sesiones stateful con se�ales/almacenamientos ef�meros. El objetivo es evitar reimplementar manejo de interacciones en cada comando complejo (p.ej. dise�ador de embeds, paginaciones).
- Los *components handlers* en `src/components/*.ts` son la entrada de botones y select menus. Est�n desacoplados del comando que los cre� y delegan en `modules/ui` o en sistemas seg�n corresponda.

## Flujo de datos
- Los repositorios de datos (`src/db/repositories/*`) son la frontera con Mongo. Los m�dulos/sistemas los consumen en vez de usar modelos directos para mantener reglas de dominio y normalizaci�n en un solo lugar.
- `src/db/fixDb.ts` se ejecuta al inicio para rellenar defaults y sanear estructuras; est� pensado como guardarra�les en entornos en vivo, no como reemplazo de migraciones.

## Filosof�a general
- El proyecto privilegia **delegar la l�gica de negocio** a m�dulos/sistemas dedicados y mantener comandos/listeners como coordinadores delgadas.
- La separaci�n handler -> hook -> listener permite **activar/desactivar features** sin tocar el resto del c�digo y facilita aislar pruebas.
- Las dependencias cruzadas se resuelven por importaciones expl�citas y cach�s de corta vida (features, canales, cooldowns) para reducir llamadas a la base sin mantener estados globales complejos.
