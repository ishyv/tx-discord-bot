"""Content pack path resolution.

This module handles locating content pack files within a pack directory.
It supports both .json and .json5 extensions with preference for .json5.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from rpg_content_cli.errors import FileNotFoundError_


@dataclass(frozen=True, slots=True)
class PackPaths:
    """Resolved paths to content pack files.
    
    Invariants:
        - All paths point to existing files (except optional packs)
        - pack_dir is a directory containing the pack files
        - store may be None if not yet created
    """
    pack_dir: Path
    quests: Path
    items: Path
    recipes: Path
    store: Path | None = None  # Optional, created on first store command


def _resolve_pack_file(pack_dir: Path, basename: str) -> Path:
    """Resolve a content pack file, preferring .json5 over .json.
    
    Args:
        pack_dir: Directory containing pack files
        basename: Base filename without extension (e.g., "rpg.quests")
        
    Returns:
        Path to the existing pack file
        
    Raises:
        FileNotFoundError_: If neither .json5 nor .json exists
    """
    for extension in (".json5", ".json"):
        candidate = pack_dir / f"{basename}{extension}"
        if candidate.exists():
            return candidate
    raise FileNotFoundError_(str(pack_dir), basename)


def _resolve_optional_pack_file(pack_dir: Path, basename: str) -> Path | None:
    """Resolve an optional content pack file.
    
    Args:
        pack_dir: Directory containing pack files
        basename: Base filename without extension
        
    Returns:
        Path to the existing pack file, or None if not found
    """
    for extension in (".json5", ".json"):
        candidate = pack_dir / f"{basename}{extension}"
        if candidate.exists():
            return candidate
    return None


def resolve_pack_paths(pack_dir: Path) -> PackPaths:
    """Resolve all content pack file paths.
    
    Args:
        pack_dir: Directory containing content packs
        
    Returns:
        PackPaths with resolved paths to quests, items, recipes, and optionally store
        
    Raises:
        FileNotFoundError_: If any required pack file is missing
        
    Expected files:
        - rpg.quests.json5 or rpg.quests.json (required)
        - rpg.materials.json5 or rpg.materials.json (required)
        - rpg.recipes.json5 or rpg.recipes.json (required)
        - rpg.store.json5 or rpg.store.json (optional)
    """
    return PackPaths(
        pack_dir=pack_dir,
        quests=_resolve_pack_file(pack_dir, "rpg.quests"),
        items=_resolve_pack_file(pack_dir, "rpg.materials"),
        recipes=_resolve_pack_file(pack_dir, "rpg.recipes"),
        store=_resolve_optional_pack_file(pack_dir, "rpg.store"),
    )


def get_store_path(pack_dir: Path) -> Path:
    """Get the default path for the store pack file.
    
    Args:
        pack_dir: Directory containing pack files
        
    Returns:
        Path where the store pack should be created (rpg.store.json)
    """
    return pack_dir / "rpg.store.json"

