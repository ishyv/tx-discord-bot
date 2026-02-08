"""JSON and JSON5 file I/O with atomic writes.

This module handles reading and writing content pack files:
- Supports both .json and .json5 extensions
- Provides fallback JSON5 parsing when json5 module is unavailable
- Uses atomic write pattern (write temp file, then rename)
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from rpg_content_cli.errors import InvalidJsonError


def parse_json5_loose(content: str) -> Any:
    """Parse JSON5 content with a loose regex-based parser.
    
    This is a fallback parser when the json5 module is not installed.
    It handles the most common JSON5 extensions:
    - Block comments (/* ... */)
    - Line comments (//)
    - Trailing commas
    - Unquoted object keys
    
    Args:
        content: Raw JSON5 content string
        
    Returns:
        Parsed Python object
        
    Raises:
        InvalidJsonError: If parsing fails
        
    Note:
        This is not a full JSON5 parser. For production use with complex
        JSON5 files, install the json5 package.
    """
    # Remove block comments
    without_block_comments = re.sub(r"/\*[\s\S]*?\*/", "", content)
    # Remove line comments
    without_line_comments = re.sub(
        r"^\s*//.*$", "", without_block_comments, flags=re.MULTILINE
    )
    # Remove trailing commas
    without_trailing_commas = re.sub(r",\s*([}\]])", r"\1", without_line_comments)
    # Quote unquoted keys
    quoted_unquoted_keys = re.sub(
        r'([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:',
        r'\1"\2":',
        without_trailing_commas,
    )
    try:
        return json.loads(quoted_unquoted_keys)
    except json.JSONDecodeError as exc:
        raise InvalidJsonError("<json5>", str(exc)) from exc


def parse_content_file(path: Path) -> Any:
    """Parse a JSON or JSON5 content pack file.
    
    Args:
        path: Path to the content file (.json or .json5)
        
    Returns:
        Parsed Python object (typically a dict)
        
    Raises:
        InvalidJsonError: If parsing fails
        FileNotFoundError: If file doesn't exist
        
    Behavior:
        - .json files are parsed with standard json module
        - .json5 files attempt to use json5 module, falling back to loose parser
    """
    raw = path.read_text(encoding="utf-8")
    
    if path.suffix == ".json":
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise InvalidJsonError(str(path), str(exc)) from exc
    
    if path.suffix == ".json5":
        try:
            import json5  # type: ignore[import-untyped]
            return json5.loads(raw)
        except ModuleNotFoundError:
            return parse_json5_loose(raw)
        except Exception:
            # json5 failed, try loose parser
            return parse_json5_loose(raw)
    
    raise InvalidJsonError(str(path), f"Unsupported file extension: {path.suffix}")


def write_content_file(path: Path, payload: Any) -> None:
    """Write content to a file atomically.
    
    Uses a write-then-rename pattern to ensure file integrity:
    1. Write to a temporary file (path.tmp)
    2. Rename temp file to target path
    
    Args:
        path: Target file path
        payload: Python object to serialize as JSON
        
    Invariants:
        - Parent directories are created if they don't exist
        - File is always valid JSON after write completes
        - Original file is not corrupted if write fails partway
        
    Note:
        Output is always .json format, even if input was .json5.
        This normalizes files on first edit.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    temp_path.write_text(serialized, encoding="utf-8")
    temp_path.replace(path)
