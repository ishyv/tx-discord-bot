"""Typed error hierarchy with explicit failure states.

This module provides a consistent Result/Error pattern for the CLI:
- All domain errors extend CliError and carry structured context
- User-facing messages are derived from error type and context
- Errors can be caught at the CLI boundary and formatted cleanly
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, TypeVar, Union

T = TypeVar("T")


# -----------------------------------------------------------------------------
# Result Type
# -----------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class Ok(Generic[T]):
    """Successful result containing a value.
    
    Invariants:
        - value is never None (use Optional[T] inside if needed)
    """
    value: T


@dataclass(frozen=True, slots=True)
class Err:
    """Failed result containing an error.
    
    Invariants:
        - error is always a CliError subclass
    """
    error: "CliError"


Result = Union[Ok[T], Err]
"""Discriminated union for operation results. Check with isinstance(result, Ok)."""


def is_ok(result: Result[T]) -> bool:
    """Type guard for successful results."""
    return isinstance(result, Ok)


def is_err(result: Result[T]) -> bool:
    """Type guard for error results."""
    return isinstance(result, Err)


def unwrap(result: Result[T]) -> T:
    """Extract value from Ok, or raise the error from Err.
    
    Raises:
        CliError: If result is Err
    """
    if isinstance(result, Ok):
        return result.value
    raise result.error


# -----------------------------------------------------------------------------
# Error Hierarchy
# -----------------------------------------------------------------------------

class CliError(RuntimeError):
    """Base error for all CLI operations.
    
    Subclasses provide structured context; the __str__ method formats
    user-facing messages. Never use raw CliError; always use a specific subclass.
    """
    pass


class FileNotFoundError_(CliError):
    """Content pack file is missing.
    
    Attributes:
        path: The path that was expected to exist
        basename: The pack name (e.g., "rpg.quests")
    """
    def __init__(self, path: str, basename: str) -> None:
        self.path = path
        self.basename = basename
        super().__init__(f"Missing content pack: {basename}.json5 or {basename}.json in {path}")


class InvalidJsonError(CliError):
    """JSON/JSON5 parsing failed.
    
    Attributes:
        path: The file that failed to parse
        detail: Parser error message
    """
    def __init__(self, path: str, detail: str) -> None:
        self.path = path
        self.detail = detail
        super().__init__(f"Invalid JSON in {path}: {detail}")


class ValidationError(CliError):
    """Content failed schema or cross-reference validation.
    
    Attributes:
        issues: List of validation error messages with JSON paths
    """
    def __init__(self, issues: list[str]) -> None:
        self.issues = issues
        joined = "\n".join(f" - {issue}" for issue in issues[:30])
        extra = "" if len(issues) <= 30 else f"\n - ... and {len(issues) - 30} more"
        super().__init__(f"Validation failed:\n{joined}{extra}")


class NotFoundError(CliError):
    """Entity with the given ID does not exist.
    
    Attributes:
        entity_type: "Quest", "Item", or "Recipe"
        entity_id: The ID that was searched for
    """
    def __init__(self, entity_type: str, entity_id: str) -> None:
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(f"{entity_type} '{entity_id}' not found")


class DuplicateIdError(CliError):
    """Entity with the given ID already exists.
    
    Attributes:
        entity_type: "Quest", "Item", or "Recipe"
        entity_id: The duplicate ID
    """
    def __init__(self, entity_type: str, entity_id: str) -> None:
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(f"{entity_type} '{entity_id}' already exists")


class InvalidPathError(CliError):
    """JSON path expression is malformed.
    
    Attributes:
        path: The invalid path string
        detail: Explanation of the problem
    """
    def __init__(self, path: str, detail: str) -> None:
        self.path = path
        self.detail = detail
        super().__init__(f"Invalid path '{path}': {detail}")


class PathAccessError(CliError):
    """Cannot access path in the target structure.
    
    Attributes:
        path: The path being accessed
        detail: Explanation of the structural mismatch
    """
    def __init__(self, path: str, detail: str) -> None:
        self.path = path
        self.detail = detail
        super().__init__(detail)


class InvalidValueError(CliError):
    """CLI value could not be parsed.
    
    Attributes:
        raw_value: The original string
        detail: Explanation of the parse failure
    """
    def __init__(self, raw_value: str, detail: str) -> None:
        self.raw_value = raw_value
        self.detail = detail
        super().__init__(f"Invalid value: {detail}")


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    """Single validation issue with structured location.
    
    Attributes:
        path: JSON path to the problematic field (e.g., "$quests.quests[0].steps[1].itemId")
        message: Human-readable description of the problem
        severity: "error" for blocking issues, "warning" for advisories
    """
    path: str
    message: str
    severity: str = "error"

    def __str__(self) -> str:
        return f"{self.path}: {self.message}"


@dataclass
class ValidationResult:
    """Aggregated validation result.
    
    Invariants:
        - is_valid is True iff issues is empty
        - issues are ordered by path
    """
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        """True if no errors (warnings don't count)."""
        return all(issue.severity != "error" for issue in self.issues)

    def add(self, path: str, message: str, *, severity: str = "error") -> None:
        """Record a validation issue."""
        self.issues.append(ValidationIssue(path=path, message=message, severity=severity))

    def merge(self, other: "ValidationResult") -> None:
        """Combine issues from another result."""
        self.issues.extend(other.issues)

    def to_error(self) -> ValidationError:
        """Convert to a ValidationError for raising."""
        return ValidationError([str(issue) for issue in self.issues])

    def __bool__(self) -> bool:
        """True if valid (no blocking errors)."""
        return self.is_valid
