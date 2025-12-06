# Guía de Uso: BindConfig

`BindConfig` es el nuevo sistema centralizado para gestionar la configuración de los comandos y módulos del bot.
Utiliza **Zod** para la validación de esquemas y **Enums** para la consistencia de claves.

## 1. Definir la configuración de un módulo

Crea un archivo `config.ts` dentro de tu módulo. Usa `defineConfig` y un esquema Zod.

**Ejemplo: `src/modules/features/tickets.config.ts`**

```ts
import { defineConfig, z, ConfigurableModule } from "@/configuration";

// 1. Definir el esquema con Zod
export const ticketsConfig = defineConfig(
  ConfigurableModule.Tickets,
  z.object({
    enabled: z.boolean().default(true),
    channelId: z.string(), // Requerido
    categoryId: z.string(),
    messageTitle: z.string().default("Soporte"),
  })
);

// 2. Registrar el tipo en ConfigDefinitions (Declaration Merging)
declare module "@/configuration/definitions" {
  export interface ConfigDefinitions {
    [ConfigurableModule.Tickets]: z.infer<typeof ticketsConfig>;
  }
}
```

> **Nota**: Debes agregar la entrada a `ConfigurableModule` en `src/configuration/constants.ts` y al mapeo en `src/configuration/provider.ts`.

## 2. Leer configuración

Usa `configStore.get` con el Enum del módulo.

```ts
import { configStore, ConfigurableModule } from "@/configuration";

async function onTicketCreate(guildId: string) {
  const config = await configStore.get(guildId, ConfigurableModule.Tickets);

  if (!config.enabled) return;
  // ...
}
```

## 3. Escribir configuración

Usa `configStore.set`.

```ts
import { configStore, ConfigurableModule } from "@/configuration";

async function setTicketCategory(guildId: string, categoryId: string) {
  await configStore.set(guildId, ConfigurableModule.Tickets, { categoryId });
}
```

## Migración de nuevos módulos

1. **Enum**: Agrega una clave a `ConfigurableModule` en `src/configuration/constants.ts`.
2. **Provider**: Agrega el mapeo en `CONFIG_PATHS` en `src/configuration/provider.ts`.
3. **Definir**: Crea `config.ts` con esquema Zod.
4. **Usar**: Reemplaza lógica manual por `configStore`.
