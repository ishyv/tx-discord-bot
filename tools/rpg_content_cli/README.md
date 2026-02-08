# RPG Content CLI

A type-safe CLI tool for managing RPG content packs (quests, items, recipes, store).

## Architecture

```
rpg_content_cli/
├── __init__.py              # Package root with version
├── __main__.py              # python -m rpg_content_cli entry point
├── cli.py                   # Argument parser & command wiring
├── config.py                # Constants (step kinds, difficulties, etc.)
├── errors.py                # Typed error hierarchy with Result pattern
├── py.typed                 # PEP 561 marker
├── models/
│   ├── __init__.py          # Re-exports all model types
│   ├── common.py            # ContentId type & validation
│   ├── item.py              # Item, MarketInfo, ItemKind
│   ├── quest.py             # Quest, QuestStep (discriminated union), Rewards
│   └── store.py             # StoreItem, StoreCatalog
├── persistence/
│   ├── __init__.py          # Re-exports persistence components
│   ├── json_io.py           # JSON5/JSON parsing & atomic writes
│   ├── pack_paths.py        # PackPaths resolution
│   └── repositories.py      # ContentPacks & JSON path operations
├── validation/
│   ├── __init__.py          # Re-exports validators
│   ├── schemas.py           # Per-entity schema validation
│   └── cross_refs.py        # Cross-reference checks
└── commands/
    ├── __init__.py          # Re-exports command handlers
    ├── validate.py          # validate command
    ├── quests.py            # quests subcommands
    ├── items.py             # items subcommands
    └── store.py             # store subcommands
```

## Usage

```bash
# Validate all packs
python -m rpg_content_cli --pack-dir content/packs validate

# List quests
python -m rpg_content_cli --pack-dir content/packs quests list

# Create a quest
python -m rpg_content_cli --pack-dir content/packs quests create my_quest \
    --title "My Quest" --description "A new quest"

# Modify a quest field
python -m rpg_content_cli --pack-dir content/packs quests set my_quest \
    --path difficulty --value hard

# Add a step to a quest
python -m rpg_content_cli --pack-dir content/packs quests step-add my_quest \
    --kind gather_item --qty 5 --param itemId=stone_ore --param action=mine

# List items
python -m rpg_content_cli --pack-dir content/packs items list

# Store management
python -m rpg_content_cli --pack-dir content/packs store list
python -m rpg_content_cli --pack-dir content/packs store add pyrite_ore --buy-price 50 --sell-price 42
python -m rpg_content_cli --pack-dir content/packs store set pyrite_ore --path stock --value 100
python -m rpg_content_cli --pack-dir content/packs store remove pyrite_ore
```

## Extending the CLI

### Adding a New Step Kind

1. **config.py**: Add the step kind string to `QUEST_STEP_KINDS`
2. **models/quest.py**: Create a new dataclass with `kind: Literal["new_kind"]` and add it to `QuestStep` union
3. **models/quest.py**: Add a parsing case in `parse_step()`
4. **validation/schemas.py**: Add a `_validate_*_step()` function and call it from `validate_step()`

### Adding a New Item Field

1. **models/item.py**: Add the field to the `Item` dataclass with `from_dict()`/`to_dict()` handling
2. **validation/schemas.py**: Add validation in `validate_item()`
3. **commands/items.py**: Add CLI argument in `build_parser()` if needed for creation

### Adding a New Market Category

1. **config.py**: Add the category string to `MARKET_CATEGORIES`

## Type Safety

- All models use strict typing with `dataclass`
- Step kinds use discriminated unions (`Literal["kind"]` + `Union[...]`)
- Content IDs use branded `NewType` for documentation
- Errors use a typed hierarchy extending `CliError`
- The `Result[T]` pattern (`Ok[T] | Err`) is available for explicit error handling

## Error Handling

All errors extend `CliError` and carry structured context:

- `FileNotFoundError_`: Missing pack files
- `InvalidJsonError`: JSON parsing failures
- `ValidationError`: Schema/cross-reference errors
- `NotFoundError`: Entity doesn't exist
- `DuplicateIdError`: Entity ID already exists
- `InvalidPathError`: JSON path syntax error
- `PathAccessError`: Path traversal error
- `InvalidValueError`: CLI value parsing error

Errors are caught at the CLI boundary in `main()` and formatted for users.
