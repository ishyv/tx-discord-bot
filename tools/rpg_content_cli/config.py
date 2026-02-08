"""Configuration constants for RPG content validation and creation.

This module centralizes all enumerations and constants used across the CLI.
Adding a new step kind, difficulty, or category requires updating only this file.
"""

from __future__ import annotations

import re
from typing import Final, FrozenSet

# -----------------------------------------------------------------------------
# ID Validation
# -----------------------------------------------------------------------------

ID_REGEX: Final[re.Pattern[str]] = re.compile(r"^[a-z0-9_]+$")
"""Valid content ID pattern: lowercase letters, digits, underscores only."""


# -----------------------------------------------------------------------------
# Quest Enumerations
# -----------------------------------------------------------------------------

QUEST_DIFFICULTIES: Final[FrozenSet[str]] = frozenset({
    "easy",
    "medium",
    "hard",
    "expert",
    "legendary",
})
"""Valid quest difficulty levels."""

QUEST_REPEAT_KINDS: Final[FrozenSet[str]] = frozenset({
    "none",
    "daily",
    "weekly",
    "cooldown",
})
"""Valid quest repeat modes."""

QUEST_PROFESSIONS: Final[FrozenSet[str]] = frozenset({
    "miner",
    "lumber",
})
"""Valid player profession prerequisites."""

QUEST_STEP_KINDS: Final[FrozenSet[str]] = frozenset({
    "gather_item",
    "process_item",
    "craft_recipe",
    "market_list_item",
    "market_buy_item",
    "fight_win",
})
"""Valid quest step kind discriminators. Adding a new step kind requires:
1. Add the kind string here
2. Add a step model variant in models/quest.py
3. Add validation logic in validation/schemas.py
"""


# -----------------------------------------------------------------------------
# Gather Actions
# -----------------------------------------------------------------------------

GATHER_ACTIONS: Final[FrozenSet[str]] = frozenset({
    "mine",
    "forest",
})
"""Valid gather_item step action types."""


# -----------------------------------------------------------------------------
# Item Enumerations
# -----------------------------------------------------------------------------

MARKET_CATEGORIES: Final[FrozenSet[str]] = frozenset({
    "materials",
    "consumables",
    "components",
    "gear",
    "tools",
})
"""Valid market listing categories."""


# -----------------------------------------------------------------------------
# Limits
# -----------------------------------------------------------------------------

TIER_MIN: Final[int] = 1
TIER_MAX: Final[int] = 4
"""Valid tier range for location/tool requirements."""
