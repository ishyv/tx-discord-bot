"""Content pack repositories.

This module provides typed access to content pack data:
- ContentPacks holds all loaded pack data
- Repositories provide query and mutation operations
- All mutations validate before persisting
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from rpg_content_cli.errors import (
    CliError,
    DuplicateIdError,
    InvalidPathError,
    NotFoundError,
    PathAccessError,
)
from rpg_content_cli.models.common import ContentId, is_valid_content_id
from rpg_content_cli.persistence.json_io import parse_content_file, write_content_file
from rpg_content_cli.persistence.pack_paths import PackPaths


@dataclass
class ContentPacks:
    """Container for all loaded content pack data.
    
    This is the in-memory representation of the content packs.
    Raw dictionaries are used for backwards compatibility with
    the path-based editing commands (set/unset).
    
    Invariants:
        - All packs have been successfully parsed
        - quests_pack["quests"], items_pack["items"], recipes_pack["recipes"] are lists
    """
    paths: PackPaths
    quests_pack: dict[str, Any]
    items_pack: dict[str, Any]
    recipes_pack: dict[str, Any]
    
    # Cached ID sets for cross-reference validation
    _quest_ids: set[str] = field(default_factory=set, repr=False)
    _item_ids: set[str] = field(default_factory=set, repr=False)
    _recipe_ids: set[str] = field(default_factory=set, repr=False)

    def __post_init__(self) -> None:
        """Build ID caches after loading."""
        self._rebuild_id_caches()

    def _rebuild_id_caches(self) -> None:
        """Rebuild ID sets from pack data."""
        self._quest_ids.clear()
        self._item_ids.clear()
        self._recipe_ids.clear()

        quests = self.quests_pack.get("quests", [])
        if isinstance(quests, list):
            for quest in quests:
                if isinstance(quest, dict) and is_valid_content_id(quest.get("id", "")):
                    self._quest_ids.add(quest["id"])

        items = self.items_pack.get("items", [])
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and is_valid_content_id(item.get("id", "")):
                    self._item_ids.add(item["id"])

        recipes = self.recipes_pack.get("recipes", [])
        if isinstance(recipes, list):
            for recipe in recipes:
                if isinstance(recipe, dict) and is_valid_content_id(recipe.get("id", "")):
                    self._recipe_ids.add(recipe["id"])

    @property
    def quest_ids(self) -> frozenset[str]:
        """Immutable set of all quest IDs."""
        return frozenset(self._quest_ids)

    @property
    def item_ids(self) -> frozenset[str]:
        """Immutable set of all item IDs."""
        return frozenset(self._item_ids)

    @property
    def recipe_ids(self) -> frozenset[str]:
        """Immutable set of all recipe IDs."""
        return frozenset(self._recipe_ids)

    def get_quests(self) -> list[dict[str, Any]]:
        """Get the quests list (mutable)."""
        quests = self.quests_pack.get("quests", [])
        return quests if isinstance(quests, list) else []

    def get_items(self) -> list[dict[str, Any]]:
        """Get the items list (mutable)."""
        items = self.items_pack.get("items", [])
        return items if isinstance(items, list) else []

    def get_recipes(self) -> list[dict[str, Any]]:
        """Get the recipes list (mutable)."""
        recipes = self.recipes_pack.get("recipes", [])
        return recipes if isinstance(recipes, list) else []

    def find_quest(self, quest_id: str) -> tuple[int, dict[str, Any]]:
        """Find a quest by ID.
        
        Args:
            quest_id: The quest identifier
            
        Returns:
            Tuple of (index, quest_dict)
            
        Raises:
            NotFoundError: If quest doesn't exist
        """
        quests = self.get_quests()
        for index, quest in enumerate(quests):
            if isinstance(quest, dict) and quest.get("id") == quest_id:
                return index, quest
        raise NotFoundError("Quest", quest_id)

    def find_item(self, item_id: str) -> tuple[int, dict[str, Any]]:
        """Find an item by ID.
        
        Args:
            item_id: The item identifier
            
        Returns:
            Tuple of (index, item_dict)
            
        Raises:
            NotFoundError: If item doesn't exist
        """
        items = self.get_items()
        for index, item in enumerate(items):
            if isinstance(item, dict) and item.get("id") == item_id:
                return index, item
        raise NotFoundError("Item", item_id)

    def save_quests(self) -> None:
        """Persist quests pack to disk."""
        self._rebuild_id_caches()
        write_content_file(self.paths.quests, self.quests_pack)

    def save_items(self) -> None:
        """Persist items pack to disk."""
        self._rebuild_id_caches()
        write_content_file(self.paths.items, self.items_pack)


def load_all_packs(paths: PackPaths) -> ContentPacks:
    """Load all content packs from disk.
    
    Args:
        paths: Resolved pack file paths
        
    Returns:
        ContentPacks with all loaded data
        
    Raises:
        InvalidJsonError: If any pack file is invalid JSON
        CliError: If pack structure is invalid
    """
    quests_pack = parse_content_file(paths.quests)
    items_pack = parse_content_file(paths.items)
    recipes_pack = parse_content_file(paths.recipes)

    if not isinstance(quests_pack, dict):
        raise CliError(f"{paths.quests} root must be an object")
    if not isinstance(items_pack, dict):
        raise CliError(f"{paths.items} root must be an object")
    if not isinstance(recipes_pack, dict):
        raise CliError(f"{paths.recipes} root must be an object")

    return ContentPacks(
        paths=paths,
        quests_pack=quests_pack,
        items_pack=items_pack,
        recipes_pack=recipes_pack,
    )


# -----------------------------------------------------------------------------
# JSON Path Utilities
# -----------------------------------------------------------------------------

def parse_path_tokens(path: str) -> list[str | int]:
    """Parse a JSON path expression into tokens.
    
    Args:
        path: Path expression like "steps[0].itemId"
        
    Returns:
        List of string keys and integer indices
        
    Raises:
        InvalidPathError: If path syntax is invalid
        
    Examples:
        >>> parse_path_tokens("steps[0].itemId")
        ['steps', 0, 'itemId']
        >>> parse_path_tokens("market.minPrice")
        ['market', 'minPrice']
    """
    if not path.strip():
        raise InvalidPathError(path, "Path cannot be empty")

    tokens: list[str | int] = []
    key_buffer = ""
    index = 0

    while index < len(path):
        char = path[index]
        if char == ".":
            if key_buffer:
                tokens.append(key_buffer)
                key_buffer = ""
            index += 1
            continue
        if char == "[":
            if key_buffer:
                tokens.append(key_buffer)
                key_buffer = ""
            closing = path.find("]", index)
            if closing == -1:
                raise InvalidPathError(path, "Missing closing ']'")
            raw_index = path[index + 1 : closing]
            if not raw_index.isdigit():
                raise InvalidPathError(path, f"Index '{raw_index}' is not numeric")
            tokens.append(int(raw_index))
            index = closing + 1
            continue
        key_buffer += char
        index += 1

    if key_buffer:
        tokens.append(key_buffer)
    if not tokens:
        raise InvalidPathError(path, "Path cannot be empty")

    return tokens


def _ensure_container(target: Any, token: str | int, next_token: str | int) -> Any:
    """Navigate to or create a container at the given token."""
    if isinstance(token, str):
        if not isinstance(target, dict):
            raise PathAccessError(str(token), f"Cannot access key '{token}' on non-object")
        if token not in target or target[token] is None:
            target[token] = [] if isinstance(next_token, int) else {}
        return target[token]
    
    if not isinstance(target, list):
        raise PathAccessError(str(token), f"Cannot access index [{token}] on non-array")
    if token < 0 or token >= len(target):
        raise PathAccessError(str(token), f"Index [{token}] out of bounds (size={len(target)})")
    return target[token]


def set_by_path(target: Any, path: str, value: Any) -> None:
    """Set a value at the given JSON path.
    
    Args:
        target: Root object to modify
        path: JSON path expression
        value: Value to set
        
    Raises:
        InvalidPathError: If path syntax is invalid
        PathAccessError: If path cannot be traversed
        
    Note:
        Creates intermediate containers as needed.
    """
    tokens = parse_path_tokens(path)
    cursor = target
    for index, token in enumerate(tokens[:-1]):
        cursor = _ensure_container(cursor, token, tokens[index + 1])

    leaf = tokens[-1]
    if isinstance(leaf, str):
        if not isinstance(cursor, dict):
            raise PathAccessError(path, f"Cannot set key '{leaf}' on non-object")
        cursor[leaf] = value
        return

    if not isinstance(cursor, list):
        raise PathAccessError(path, f"Cannot set index [{leaf}] on non-array")
    if leaf < 0 or leaf >= len(cursor):
        raise PathAccessError(path, f"Index [{leaf}] out of bounds (size={len(cursor)})")
    cursor[leaf] = value


def delete_by_path(target: Any, path: str) -> None:
    """Delete a value at the given JSON path.
    
    Args:
        target: Root object to modify
        path: JSON path expression
        
    Raises:
        InvalidPathError: If path syntax is invalid
        PathAccessError: If path cannot be traversed or value doesn't exist
    """
    tokens = parse_path_tokens(path)
    cursor = target
    for index, token in enumerate(tokens[:-1]):
        cursor = _ensure_container(cursor, token, tokens[index + 1])

    leaf = tokens[-1]
    if isinstance(leaf, str):
        if not isinstance(cursor, dict):
            raise PathAccessError(path, f"Cannot delete key '{leaf}' on non-object")
        if leaf not in cursor:
            raise PathAccessError(path, f"Key '{leaf}' does not exist")
        del cursor[leaf]
        return

    if not isinstance(cursor, list):
        raise PathAccessError(path, f"Cannot delete index [{leaf}] on non-array")
    if leaf < 0 or leaf >= len(cursor):
        raise PathAccessError(path, f"Index [{leaf}] out of bounds (size={len(cursor)})")
    cursor.pop(leaf)
