# Economía e inventario

Marco de referencia para entender la lógica del sistema económico y de ítems sin leer la implementación. Todo persiste en el documento `users` (ver `src/db/models/user.schema.ts`) usando campos mixtos `currency` e `inventory`.

## Diseño de monedas

- Contrato `Currency` y registro compartido en `src/modules/economy/currency.ts` y `currencyRegistry.ts`. Permite definir nuevas monedas declarando `id`, reglas de suma/resta y validación (`isValid`) sin tocar el motor.
- `Coins` (`src/modules/economy/currencies/coin.ts`) modela saldo doble: `hand` (efectivo), `bank` (banco) y el flag `use_total_on_subtract` para retiros que consumen ambos saldos en cascada. La regla de negocio prohíbe saldos negativos para evitar deudas.
- Las monedas se registran automáticamente con el decorador `@Register`, lo que mantiene el catálogo sincronizado al cargar el módulo y evita IDs duplicados.

## Motor de transacciones

- `currencyTransaction` en `src/modules/economy/transactions.ts` es el único punto de entrada para mutar saldos. Usa `CurrencyEngine` para simular primero la operación (`canApply`) y rechazar si faltan fondos o la moneda no es válida.
- El motor admite costos y recompensas en la misma transacción para garantizar atomicidad. Si la suma/resta produce un estado inválido según la moneda, se corta antes de escribir.
- Persistencia con _optimistic concurrency_: se lee el inventario, se calcula el estado nuevo y se intenta `findOneAndUpdate` condicionando al inventario anterior. Si otro proceso escribió en medio, se recarga y reintenta hasta 3 veces. Esto evita sobrescribir saldos en escenarios de alta concurrencia sin usar locks globales.
- Racional: aislar la aritmética por moneda y la escritura atómica para que las UI/commands solo describan la transacción deseada (costos/recompensas) y no gestionen validaciones duplicadas.

## Comandos de economía

- `/economy balance`, `/economy deposit`, `/economy withdraw`, `/economy give-currency` en `src/commands/economy/*.ts` son la cara de usuario. Todos delegan en el motor y en los repos `users` (`src/db/repositories/users.ts`) para mantener las reglas en un solo lugar.
- El helper `src/utils/economy.ts` formatea saldos y encapsula defaults para UI (por ejemplo, mostrar hand/bank sin exponer el flag `use_total_on_subtract`).

## Inventario de ítems

- Tipos y defaults en `src/modules/inventory/definitions.ts`; los ítems disponibles se listan en `ITEM_DEFINITIONS` y se pueden extender sin migraciones siempre que el ID sea estable.
- Operaciones puras sobre inventario en `src/modules/inventory/inventory.ts`: sumar/restar clampa cantidades, respeta `maxStack`, elimina el ítem cuando queda en cero y normaliza las cantidades a enteros. `hasItem` sirve para validar costos antes de ejecutar acciones.
- Transacciones atómicas de ítems en `src/modules/inventory/transactions.ts`: verifica disponibilidad de todos los costos antes de aplicar, luego escribe el resultado en Mongo y devuelve el snapshot final. Si falta un ítem, falla sin efectos parciales.
- Integraciones visibles en comandos de juego (`src/commands/game/*.ts`) que leen el inventario para mostrarlo o transferir ítems, pero nunca modifican directamente los documentos sin pasar por las funciones del módulo.

## Relación con la capa de datos

- `users.currency` y `users.inventory` son `Schema.Types.Mixed` en la base para permitir evolución de formato sin migraciones recurrentes. `fixDb` rellena defaults cuando faltan campos.
- La combinación de motor + repositorio evita que una UI antigua escriba estructuras incompatibles; siempre que use los módulos, los checks de validación y los retires optimistas protegen la integridad del estado económico.
