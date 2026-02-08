"""Persistence layer for RPG content packs.

This module exports file I/O and repository components:
- JSON5/JSON parsing and atomic writes
- PackPaths resolution
- Typed repositories for quests, items, and recipes
"""

from rpg_content_cli.persistence.json_io import (
    parse_content_file,
    parse_json5_loose,
    write_content_file,
)
from rpg_content_cli.persistence.pack_paths import PackPaths, get_store_path, resolve_pack_paths
from rpg_content_cli.persistence.repositories import ContentPacks, load_all_packs

__all__ = [
    # JSON I/O
    "parse_content_file",
    "parse_json5_loose",
    "write_content_file",
    # Pack Paths
    "PackPaths",
    "get_store_path",
    "resolve_pack_paths",
    # Repositories
    "ContentPacks",
    "load_all_packs",
]
