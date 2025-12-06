# Sistema de Configuración Centralizada (BindConfig)

Este documento describe la arquitectura y uso del nuevo sistema de configuración `BindConfig`, diseñado para centralizar, validar y tipar la configuración de los distintos módulos del bot.

## Motivación

Anteriormente, cada comando implementaba su propia lógica de lectura y escritura en la base de datos, lo que llevaba a:

- Código repetitivo (boilerplate).
- Validaciones inconsistentes.
- Acoplamiento fuerte entre la lógica del comando y la estructura de MongoDB.
- Dificultad para saber qué configuraciones existían globalmente.

`BindConfig` resuelve esto separando la **definición** (Schema Zod), el **acceso** (Provider) y el **uso** (Store).

## Arquitectura

### 1. Definiciones (`definitions.ts` & Schemas)

Cada módulo define su "forma" usando **Zod**. Esto garantiza que los datos que entran y salen del sistema siempre cumplan con el contrato esperado.

```typescript
// Ejemplo: src/commands/moderation/tickets/config.ts
export const ticketsConfig = defineConfig(
  ConfigurableModule.Tickets,
  z.object({
    enabled: z.boolean().default(true),
    categoryId: z.string().optional(),
  })
);
```

### 2. Constantes (`constants.ts`)

Usamos un `Enum` global `ConfigurableModule` para evitar "strings mágicos". Cada módulo configurable debe tener una entrada aquí.

### 3. Provider (`provider.ts`)

Es el adaptador que habla con la base de datos. Mapea las claves lógicas (ej. `ConfigurableModule.Reputation`) a rutas físicas en el documento `Guild` de MongoDB (ej. `reputation`).
Usa `doc.set()` de Mongoose para realizar actualizaciones parciales seguras, manejando la notación de puntos automáticamente.

### 4. Store (`store.ts`)

Es la API pública que usan los comandos.

- `get(guildId, module)`: Obtiene la config, aplica defaults y valida safe-parse.
- `set(guildId, module, partial)`: Valida el partial contra el schema y persiste los cambios.

## Guía de Migración

Para mover un módulo existente al nuevo sistema:

1.  **Registrar el Módulo**:

    - Agrega una entrada en `ConfigurableModule` (`src/configuration/constants.ts`).
    - Agrega el mapeo de ruta en `CONFIG_PATHS` (`src/configuration/provider.ts`).

2.  **Crear el Schema**:

    - Crea un archivo `config.ts` en la carpeta del módulo.
    - Define el schema con `zod`.
    - Usa _Declaration Merging_ para extender `ConfigDefinitions`.

3.  **Refactorizar Comandos**:
    - Elimina importaciones directas de Mongoose o Repositorios antiguos.
    - Usa `configStore.get` para leer en listeners o comandos.
    - Usa `configStore.set` para guardar cambios desde comandos de configuración.

## Ejemplo Completo

```typescript
// 1. Definición
export const myModuleConfig = defineConfig(
  ConfigurableModule.MyModule,
  z.object({
    limit: z.number().min(1).max(100).default(50),
  })
);

// 2. Uso
const config = await configStore.get(guildId, ConfigurableModule.MyModule);
console.log(config.limit); // 50 (default) o valor DB

await configStore.set(guildId, ConfigurableModule.MyModule, { limit: 99 });
```
