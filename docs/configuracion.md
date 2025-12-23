# Sistema de Configuración (BindConfig)

Este documento describe la arquitectura y uso del sistema `BindConfig`, diseñado para centralizar, validar y tipar la configuración de todos los módulos del bot.

## Motivación

El sistema resuelve la dispersión de la configuración mediante:

- **Centralización**: Todas las definiciones de configuración se registran en un registry único.
- **Validación Fuerte**: Uso de **Zod** para asegurar que los datos cumplan con el contrato esperado.
- **Abstracción de Datos**: Los comandos no interactúan con MongoDB; usan una API de alto nivel que gestiona la persistencia y el caché.

## Componentes del Sistema

1. **Definiciones (`defineConfig`)**: Cada módulo define su esquema (Zod) y su ruta de almacenamiento lógica mediante `defineConfig`.
2. **Registro Central**: Las configuraciones se registran explícitamente, lo que permite al sistema resolver rutas y aplicar tipos de forma automática.
3. **Store (`configStore`)**: Es la interfase pública para el resto del bot.
   - `get(guildId, module)`: Recupera la configuración, aplica valores por defecto y valida los datos. Incluye una capa de caché para optimizar el rendimiento.
   - `set(guildId, module, partial)`: Valida el cambio parcial y lo persiste de forma segura en la base de datos.
4. **Provider**: El adaptador encargado de traducir las peticiones lógicas a operaciones físicas en el documento del servidor (MongoDB).

## Guía de Uso

### 1. Definir la Configuración

Crea un archivo de configuración en tu módulo (ej. `config.ts`) usando `defineConfig`.

```typescript
export const myModuleConfig = defineConfig(
  ConfigurableModule.MyModule,
  z.object({
    enabled: z.boolean().default(true),
    limit: z.number().default(50),
  })
);
```

### 2. Leer Configuración

```typescript
const config = await configStore.get(guildId, ConfigurableModule.MyModule);
if (config.enabled) {
  // ... lógica
}
```

### 3. Modificar Configuración

```typescript
await configStore.set(guildId, ConfigurableModule.MyModule, { limit: 100 });
```

## Beneficios

- **Tipado Automático**: Gracias a TypeScript y Zod, el código que consume la configuración tiene autocompletado y validación de tipos inmediata.
- **Integridad**: Es imposible persistir datos que no cumplan con el esquema definido.
- **Rendimiento**: El caché integrado reduce drásticamente las consultas a la base de datos para configuraciones estáticas o de lectura frecuente.
