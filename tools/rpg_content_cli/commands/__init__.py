"""CLI commands for RPG content management.

This module exports all command handlers:
- validate: Pack validation
- quests: Quest CRUD and step management
- items: Item CRUD
- store: Store catalog management
"""

from rpg_content_cli.commands.items import (
    cmd_items_create,
    cmd_items_delete,
    cmd_items_list,
    cmd_items_set,
    cmd_items_show,
    cmd_items_unset,
)
from rpg_content_cli.commands.quests import (
    cmd_quests_create,
    cmd_quests_delete,
    cmd_quests_list,
    cmd_quests_set,
    cmd_quests_show,
    cmd_quests_step_add,
    cmd_quests_step_remove,
    cmd_quests_unset,
)
from rpg_content_cli.commands.store import (
    cmd_store_add,
    cmd_store_list,
    cmd_store_remove,
    cmd_store_set,
    cmd_store_show,
)
from rpg_content_cli.commands.validate import cmd_validate

__all__ = [
    # Validate
    "cmd_validate",
    # Quests
    "cmd_quests_list",
    "cmd_quests_show",
    "cmd_quests_create",
    "cmd_quests_delete",
    "cmd_quests_set",
    "cmd_quests_unset",
    "cmd_quests_step_add",
    "cmd_quests_step_remove",
    # Items
    "cmd_items_list",
    "cmd_items_show",
    "cmd_items_create",
    "cmd_items_delete",
    "cmd_items_set",
    "cmd_items_unset",
    # Store
    "cmd_store_list",
    "cmd_store_show",
    "cmd_store_add",
    "cmd_store_remove",
    "cmd_store_set",
]

