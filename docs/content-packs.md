# Content Packs (RPG Economy)

## Estructura

Los packs viven en `content/packs/`:

- `rpg.materials.json`: materiales base y procesados.
- `rpg.craftables.json`: items craftables (ej. herramientas).
- `rpg.recipes.json`: recetas de `crafting` y `processing`.
- `rpg.drop_tables.json`: tablas de drop por acción/tier/profesión.
- `rpg.locations.json`: ubicaciones RPG y su relación con drop tables.

Cada archivo usa:

```json
{
  "schemaVersion": 1,
  "...": []
}
```

## Convenciones

- IDs: `^[a-z0-9_]+$` (ej. `moon_silver_ore`).
- Profesiones: `miner` o `lumber`.
- Acciones de gathering: `mine` o `forest`.
- Tiers soportados: `1..4`.
- Recetas:
  - `type: "crafting"` para crafteo clásico.
  - `type: "processing"` para transformar materia prima.

## Ejemplo: Item

```json
{
  "id": "pyrite_ore",
  "name": "Pyrite Ore",
  "description": "A bright ore used by novice miners.",
  "maxStack": 99,
  "canStack": true,
  "weight": 3,
  "value": 24
}
```

## Ejemplo: Receta

```json
{
  "id": "craft_miner_pickaxe_t2",
  "name": "Forge Pyrite Pickaxe",
  "description": "Build a tier 2 pickaxe for miner progression.",
  "type": "crafting",
  "itemInputs": [
    { "itemId": "pyrite_ingot", "quantity": 8 },
    { "itemId": "resin_pine_plank", "quantity": 4 }
  ],
  "itemOutputs": [
    { "itemId": "pickaxe_lv2", "quantity": 1 }
  ],
  "currencyInput": { "currencyId": "coins", "amount": 240 },
  "professionRequirement": "miner",
  "tierRequirement": 1,
  "enabled": true
}
```

## Ejemplo: Drop Table

```json
{
  "id": "mine_t4",
  "action": "mine",
  "profession": "miner",
  "tier": 4,
  "locationId": "silver_mine",
  "entries": [
    { "itemId": "moon_silver_ore", "chance": 0.45, "weight": 2, "minQty": 2, "maxQty": 4, "minToolTier": 4 },
    { "itemId": "sunstone_shard", "chance": 0.15, "weight": 1, "minQty": 1, "maxQty": 2, "minToolTier": 4 }
  ]
}
```

## Validación

Validar packs localmente:

```bash
bun run content:validate
```

En startup, el bot hace fail-fast si los packs son inválidos.
