# Economy System Documentation

This directory contains planning and design documentation for the PyE Bot economy system.

## Files

### ECONOMY_INTEGRATION_PLAN.md
Original integration plan covering:
- Current implementation documentation (data locations, patterns, invariants)
- Proposed architecture for core account + read-only views
- Module map and interface definitions
- Migration strategy with backward compatibility notes

### ECONOMY_TYPES_SKETCH.ts
TypeScript reference file containing:
- Domain type definitions (`EconomyAccount`, `AccountStatus`)
- View types for read-only commands
- Repository and Service interfaces
- Zod schema sketches
- Error types and guards

### ECONOMY_CHANGELOG.md
Implementation changelog covering:
- Phase 3 features (pagination, filtering, safety edges)
- New commands (`/bank`, `/profile`, `/progress`)
- Enhanced commands (`/balance`, `/inventory`)
- Technical architecture details
- Database changes
- Future considerations

## Quick Reference

### New Commands (Phase 3)
| Command | Description |
|---------|-------------|
| `/bank` | Bank breakdown with safety rating |
| `/profile` | Complete economy profile summary |
| `/progress` | XP + level progression for the guild |

### Enhanced Commands
| Command | New Features |
|---------|--------------|
| `/balance` | Currency collapse, blocked account handling, creation notice |
| `/inventory` | Search (`buscar`), direct page (`pagina`), better empty states |

### Safety Features
- **Account Status**: ok/blocked/banned with generic denial messages
- **Data Repair**: Auto-repair corrupted fields with logging
- **Access Control**: Service-layer gating before data access
- **Graceful Degradation**: Empty states, repair flows, consistent errors

### Module Structure
```
src/modules/economy/
├── account/     # Account lifecycle, status, formatting
├── progression/ # XP + level progression
├── views/       # View builders (balance, bank, inventory, profile)
├── currencies/  # Currency implementations
└── ...          # Core currency system
```

## Testing

Run economy-specific tests:
```bash
bun test-db  # Runs all db tests including economy-account.int.test.ts
```

Test coverage:
- Lazy account initialization
- Corruption detection and repair
- Pagination boundaries
- Status management
- Access control

## Backward Compatibility

All changes are backward compatible:
- Existing user data remains valid
- New `economyAccount` field is optional
- Accounts created lazily on first access
- No migration scripts required
