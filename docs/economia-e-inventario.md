# Econom�a e inventario

Marco de referencia para entender la l�gica del sistema econ�mico y de �tems sin leer la implementaci�n. Todo persiste en el documento `users` (ver `src/db/models/user.schema.ts`) usando campos mixtos `currency` e `inventory`.

## Dise�o de monedas
- Contrato `Currency` y registro compartido en `src/modules/economy/currency.ts` y `currencyRegistry.ts`. Permite definir nuevas monedas declarando `id`, reglas de suma/resta y validaci�n (`isValid`) sin tocar el motor.
- `Coins` (`src/modules/economy/currencies/coin.ts`) modela saldo doble: `hand` (efectivo), `bank` (banco) y el flag `use_total_on_subtract` para retiros que consumen ambos saldos en cascada. La regla de negocio proh�be saldos negativos para evitar deudas.
- Las monedas se registran autom�ticamente con el decorador `@Register`, lo que mantiene el cat�logo sincronizado al cargar el m�dulo y evita IDs duplicados.

## Motor de transacciones
- `currencyTransaction` en `src/modules/economy/transactions.ts` es el �nico punto de entrada para mutar saldos. Usa `CurrencyEngine` para simular primero la operaci�n (`canApply`) y rechazar si faltan fondos o la moneda no es v�lida.
- El motor admite costos y recompensas en la misma transacci�n para garantizar atomicidad. Si la suma/resta produce un estado inv�lido seg�n la moneda, se corta antes de escribir.
- Persistencia con *optimistic concurrency*: se lee el inventario, se calcula el estado nuevo y se intenta `findOneAndUpdate` condicionando al inventario anterior. Si otro proceso escribi� en medio, se recarga y reintenta hasta 3 veces. Esto evita sobrescribir saldos en escenarios de alta concurrencia sin usar locks globales.
- Racional: aislar la aritm�tica por moneda y la escritura at�mica para que las UI/commands solo describan la transacci�n deseada (costos/recompensas) y no gestionen validaciones duplicadas.

## Comandos de econom�a
- `/economy balance`, `/economy deposit`, `/economy withdraw`, `/economy give-currency` en `src/commands/economy/*.ts` son la cara de usuario. Todos delegan en el motor y en los repos `users` (`src/db/repositories/users.ts`) para mantener las reglas en un solo lugar.
- El helper `src/utils/economy.ts` formatea saldos y encapsula defaults para UI (por ejemplo, mostrar hand/bank sin exponer el flag `use_total_on_subtract`).

## Inventario de �tems
- Tipos y defaults en `src/modules/inventory/definitions.ts`; los �tems disponibles se listan en `ITEM_DEFINITIONS` y se pueden extender sin migraciones siempre que el ID sea estable.
- Operaciones puras sobre inventario en `src/modules/inventory/inventory.ts`: sumar/restar clampa cantidades, respeta `maxStack`, elimina el �tem cuando queda en cero y normaliza las cantidades a enteros. `hasItem` sirve para validar costos antes de ejecutar acciones.
- Transacciones at�micas de �tems en `src/modules/inventory/transactions.ts`: verifica disponibilidad de todos los costos antes de aplicar, luego escribe el resultado en Mongo y devuelve el snapshot final. Si falta un �tem, falla sin efectos parciales.
- Integraciones visibles en comandos de juego (`src/commands/game/*.ts`) que leen el inventario para mostrarlo o transferir �tems, pero nunca modifican directamente los documentos sin pasar por las funciones del m�dulo.

## Relaci�n con la capa de datos
- `users.currency` y `users.inventory` son `Schema.Types.Mixed` en la base para permitir evoluci�n de formato sin migraciones recurrentes. `fixDb` rellena defaults cuando faltan campos.
- La combinaci�n de motor + repositorio evita que una UI antigua escriba estructuras incompatibles; siempre que use los m�dulos, los checks de validaci�n y los retires optimistas protegen la integridad del estado econ�mico.
