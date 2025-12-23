# Persistencia y Capa de Datos

Guía para entender cómo el bot gestiona la persistencia. Se basa en el driver nativo de MongoDB y utiliza **Zod** como única fuente de verdad para la estructura y validación de los datos.

## Pilares de Diseño

1. **Fuente única de verdad**: Cada entidad tiene un esquema Zod definido en `src/db/schemas/*.ts`. De estos esquemas se derivan todos los tipos e interfaces del bot.
2. **Patrón Repositorio**: El acceso a datos se centraliza en `src/db/repositories/*`. Ninguna otra parte del código debe interactuar directamente con el driver de MongoDB.
3. **Validación en los bordes**: Los repositorios se encargan de validar tanto la entrada (antes de escribir) como la salida (al leer de la DB) usando los esquemas Zod.
4. **Operaciones Atómicas**: Se prefieren actualizaciones atómicas (`$set`, `$inc`, `$push`) y concurrencia optimista para evitar condiciones de carrera sin bloqueos globales.

## Estructura de Datos (Esquemas)

Los esquemas aplican defaults y normalizan los datos automáticamente:

- **Usuarios (`user.ts`)**: Identificados por su Discord ID. Gestiona reputación, advertencias (warns), tickets abiertos y mapas flexibles para economía e inventario.
- **Servidores (`guild.ts`)**: Identificados por su Discord ID. Almacena configuración de canales, roles gestionados, estados de funciones (features) y palabras clave de reputación.
- **Autoroles (`autorole.ts`)**: Define las reglas de asignación automática de roles, el registro de asignaciones temporales y los contadores de reacciones.
- **Ofertas (`offers.ts`)**: Gestiona el flujo de vida de las ofertas de comunidad, desde su creación hasta su aprobación o rechazo.
- **Estadísticas (`tops.ts`)**: Mantiene las ventanas de tiempo activas para el conteo de actividad y el historial de reportes generados.

## Uso de Repositorios

Los repositorios exponen funciones con nombres que describen la **intención de negocio**, no la operación técnica:

- **Propósito**: Encapsular la lógica de consulta compleja, aplicar filtros por guild/usuario y asegurar que los datos devueltos sean POJOs (Plain Old JavaScript Objects) limpios y validados.
- **Convención**: Si necesitas un dato, búscalo en el repositorio correspondiente. Si el método no existe, extiéndelo en el repositorio en lugar de hacer la consulta manualmente en tu comando o sistema.

## Ciclo de Vida de la Conexión

- La conexión se inicializa al arrancar el bot (`src/index.ts`) y se mantiene como un singleton gestionado en `src/db/mongo.ts`.
- No es necesario abrir o cerrar conexiones en el código de negocio; los repositorios acceden automáticamente al cliente ya conectado.

## Extensibilidad

Para añadir nuevos campos o entidades:

1. Define la forma en un esquema Zod.
2. Crea o extiende un repositorio para gestionar las operaciones de esa entidad.
3. Exporta todo a través de `src/db/index.ts` para mantener las importaciones limpias.
