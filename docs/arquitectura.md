# Arquitectura del bot

Fotografía de cómo están orquestadas las piezas principales del runtime. Esta guía busca aclarar _por qué_ se eligieron ciertos patrones y dónde encontrar cada responsabilidad, sin repetir el código.

## Puntos de entrada y ciclo de vida

- `src/index.ts` es el arranque único: carga augmentations de UI, extiende el contexto de Seyfert con helpers de logging, aplica middlewares globales y asegura la conexión a la base de datos antes de inicializar el cliente.
- Los **Handlers** de eventos actúan como puente entre el gateway de Seyfert y los hooks internos. Su única responsabilidad es recibir el evento y re-emitirlo a los hooks tipados.
- Los **Hooks** (`src/events/hooks/*.ts`) son buses en memoria que permiten desacoplar el transporte del evento de la lógica de negocio.
- Los **Listeners** (`src/events/listeners/*.ts`) implementan las reglas de negocio en respuesta a eventos (logs, automod, reputación, etc.), registrándose en los hooks correspondientes.

## Capas y convenciones

- **Comandos y componentes**: Viven en `src/commands` y `src/components`. Son envoltorios delgados para la validación de entrada y la interacción con el usuario (UI), delegando la lógica pesada a módulos o sistemas.
- **Módulos** (`src/modules/*`): Agrupan lógica reutilizable por dominio (economía, autoroles, cooldowns, etc.). Son agnósticos al transporte (no saben si vienen de un comando o un listener).
- **Sistemas** (`src/systems/*`): Orquestan flujos complejos que involucran múltiples módulos y estados (ej. Tickets, TOPs). Pueden tener su propio estado efímero o schedulers.
- **Servicios** (`src/services/*`): Integran dependencias externas o servicios pesados (IA en `src/services/ai`, OCR en `src/services/ocr`). Aislan el I/O del resto del dominio.

## Contexto y middlewares

- El contexto extendido en el arranque agrega utilidades transversales como loggers preconfigurados por guild.
- Los middlewares globales (`src/middlewares/*`) aseguran que políticas críticas (enfriamiento, límites de moderación, flags de funciones) se apliquen de forma consistente antes de llegar al código del comando.

## UI y Sesiones

- La capa de UI ofrece abstracciones sobre Seyfert para construir componentes interactivos y sesiones de usuario con estado. El objetivo es evitar que los comandos gestionen manualmente la complejidad de los botones y selectores en flujos largos.

## Persistencia y Datos

- La frontera con la base de datos se gestiona mediante **Repositorios** (`src/db/repositories/*`). Ninguna otra capa interactúa directamente con el driver de la base de datos.
- Las formas de los datos se definen mediante esquemas **Zod** (`src/db/schemas/*`), que garantizan validación y tipos seguros en tiempo de ejecución.

## Filosofía general

- **Delegación de lógica**: Los comandos y listeners son coordinadores; la inteligencia vive en módulos y sistemas.
- **Desacoplamiento**: El uso de hooks permite activar o desactivar funcionalidades sin afectar el núcleo del bot.
- **Validación en los bordes**: Los datos se validan al entrar (UI/Comandos) y al persistir (Repositorios/Zod), manteniendo el núcleo del dominio limpio y tipado.
