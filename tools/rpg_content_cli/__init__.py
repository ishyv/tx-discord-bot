"""RPG Content CLI - Modular tool for managing quests and items content packs.

This package provides a type-safe CLI for creating, editing, deleting, and validating
RPG content packs (quests, items, recipes) with clear architectural boundaries:

- **models/**: Domain models with strict typing (Quest, Item, discriminated union steps)
- **persistence/**: File I/O and repositories (JSON5/JSON parsing, atomic writes)
- **validation/**: Schema validation and cross-reference checks
- **commands/**: CLI command handlers orchestrating operations
- **errors**: Typed error hierarchy with explicit failure states
"""

__version__ = "2.0.0"
