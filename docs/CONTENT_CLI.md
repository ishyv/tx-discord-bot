# RPG Content CLI (Python)

`tools/rpg_content_cli.py` is a local CLI for editing quests and items without the web UI.

It reads:
- `content/packs/rpg.quests.json5` (falls back to `.json`)
- `content/packs/rpg.materials.json` (or `.json5` if present)
- `content/packs/rpg.recipes.json` (or `.json5` if present)

and validates cross-references before writing.

## Run

```bash
python tools/rpg_content_cli.py --help
```

or:

```bash
bun run content:cli --help
```

## Common commands

Validate all packs:

```bash
python tools/rpg_content_cli.py validate
```

List quests:

```bash
python tools/rpg_content_cli.py quests list
```

Show a quest:

```bash
python tools/rpg_content_cli.py quests show starter_miner_gather_pyrite
```

Create a quest skeleton:

```bash
python tools/rpg_content_cli.py quests create miner_supply_run \
  --title "Miner Supply Run" \
  --description "Deliver refined pyrite to market." \
  --profession miner \
  --coins 220 \
  --xp 120
```

Update any quest field by JSON path:

```bash
python tools/rpg_content_cli.py quests set starter_miner_gather_pyrite \
  --path steps[0].itemId \
  --value moon_silver_ore
```

Add a step:

```bash
python tools/rpg_content_cli.py quests step-add starter_miner_gather_pyrite \
  --kind market_list_item \
  --qty 5 \
  --param itemId=pyrite_ingot
```

List items:

```bash
python tools/rpg_content_cli.py items list
```

Create an item:

```bash
python tools/rpg_content_cli.py items create cobalt_dust \
  --name "Cobalt Dust" \
  --description "Fine powder used in smelting catalysts." \
  --value 35 \
  --category materials
```

Update any item field by JSON path:

```bash
python tools/rpg_content_cli.py items set pyrite_ore \
  --path market.suggestedPrice \
  --value 28
```

## Notes

- Writes are deterministic pretty JSON (even when source extension is `.json5`).
- Every mutation is validated before save; invalid changes are rejected.
- `quests set --path ...` and `items set --path ...` are the primary extension points to avoid hardcoded edit flows.
