#!/usr/bin/env python3
"""CLI for managing RPG quests and items content packs.

This is a compatibility wrapper that delegates to the modular rpg_content_cli package.
For the implementation, see the rpg_content_cli/ directory.

Usage:
    python rpg_content_cli.py validate
    python rpg_content_cli.py quests list
    python rpg_content_cli.py items list

For full documentation, run: python rpg_content_cli.py --help
"""

from rpg_content_cli.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
