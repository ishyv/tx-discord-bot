# Marketplace

## Objetivo

El Marketplace reemplaza el modelo de tienda infinita para items tradables:

- Jugadores listan items obtenidos por profesiones/crafting.
- Cada publicación tiene oferta finita con escrow.
- Compras transfieren moneda de comprador a vendedor.
- Tax/Fee alimenta sectores de economía del guild.

## Flujo `/market`

- `Browse`: categoría -> item -> listings -> compra.
- `Sell`: categoría -> item -> cantidad/precio -> confirmar.
- `My Listings`: ver activas y cancelar.
- `Help`: reglas rápidas.

## Reglas clave

- Solo items con `market.tradable: true` se pueden listar.
- El listado mueve items a escrow (evita doble venta).
- No se permite self-buy.
- Cuentas `blocked/banned` no pueden comprar ni vender.
- Se aplican cooldowns y límite de publicaciones activas por usuario.

## Modelo de datos

Colección: `market_listings`

Campos principales:

- `_id`, `guildId`, `sellerId`, `itemId`
- `itemKind` (`stackable` | `instance`)
- `currencyId` (`coins`)
- `pricePerUnit`
- `quantity`
- `instanceIds`, `escrowInstances` (para instancias)
- `status` (`active` | `sold_out` | `cancelled` | `expired`)
- `version`, `createdAt`, `updatedAt`, `expiresAt`

## Configuración de items (content packs)

Ejemplo:

```json
{
  "id": "pyrite_ore",
  "name": "Pyrite Ore",
  "canStack": true,
  "value": 24,
  "market": {
    "tradable": true,
    "category": "materials",
    "suggestedPrice": 24,
    "minPrice": 1,
    "maxPrice": 5000
  }
}
```

## Auditoría

Se registran operaciones:

- `market_list`
- `market_buy`
- `market_cancel`
- `market_expire` (reservado para expiración automática)

Metadata relevante:

- `listingId`, `itemId`, `qty`, `pricePerUnit`
- `subtotal`, `tax`, `fee`, `total`
- `buyerId`, `sellerId`, `correlationId`
