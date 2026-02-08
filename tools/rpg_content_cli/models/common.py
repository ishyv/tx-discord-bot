"""Common types shared across domain models.

This module defines foundational types used by both Quest and Item models.
"""

from __future__ import annotations

from typing import NewType

from rpg_content_cli.config import ID_REGEX

# -----------------------------------------------------------------------------
# Content ID Type
# -----------------------------------------------------------------------------

ContentId = NewType("ContentId", str)
"""Branded string type for valid content identifiers.

Pattern: ^[a-z0-9_]+$

This is a NewType for documentation and type-checking purposes.
Use validate_content_id() to convert raw strings safely.
"""


def validate_content_id(value: str) -> ContentId | None:
    """Validate and convert a string to a ContentId.
    
    Args:
        value: The raw string to validate
        
    Returns:
        ContentId if valid, None if invalid
        
    Example:
        >>> validate_content_id("my_quest_1")
        ContentId('my_quest_1')
        >>> validate_content_id("Invalid ID")
        None
    """
    if isinstance(value, str) and ID_REGEX.fullmatch(value):
        return ContentId(value)
    return None


def is_valid_content_id(value: str) -> bool:
    """Check if a string is a valid content ID.
    
    Args:
        value: The raw string to check
        
    Returns:
        True if the string matches the content ID pattern
    """
    return isinstance(value, str) and bool(ID_REGEX.fullmatch(value))
