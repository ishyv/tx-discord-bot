# Discord Bot UI/UX Style Guide

> **Codename: VOID ARCHIVE** — A design system for eldritch-tinged, modern-retro Discord interfaces

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Visual Identity](#visual-identity)
3. [Color System](#color-system)
4. [Typography & Formatting](#typography--formatting)
5. [Embed Structure](#embed-structure)
6. [Component Patterns](#component-patterns)
7. [Data Visualization](#data-visualization)
8. [Interaction Flows](#interaction-flows)
9. [Microcopy Guidelines](#microcopy-guidelines)
10. [Implementation Templates](#implementation-templates)

---

## Design Philosophy

### Core Principles

| Principle                   | Description                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- |
| **Clarity over Cleverness** | Information should be immediately scannable. Avoid decorative clutter.        |
| **Atmospheric Restraint**   | Lovecraftian themes are _subtle undertones_, not parody. Dread, not camp.     |
| **Compact Density**         | High information density without overwhelming. Every element earns its space. |
| **Consistent Language**     | Same patterns everywhere. Users learn once, apply everywhere.                 |
| **Actionable Hierarchy**    | Most important information first. Clear next steps.                           |

### Aesthetic Direction

```
┌─────────────────────────────────────────────────────────────┐
│  VOID ARCHIVE AESTHETIC SPECTRUM                            │
│                                                             │
│  ◀──────────────────────────────────────────────────────▶  │
│  Cosmic Dread ─────────── Modern Sharp ─────────── Antique │
│                                                             │
│  • Deep voids          • Clean angles        • Old ledgers │
│  • Distant stars       • Minimal chrome      • Index cards │
│  • Unknowable scales   • Monospace data      • Catalog #s  │
│  • Subtle unease       • Precise grids       • Archives    │
└─────────────────────────────────────────────────────────────┘
```

---

## Visual Identity

### Signature Elements

#### 1. The Void Separator

```
═══════════════════════════════
```

Used sparingly to denote major section breaks within embeds.

#### 2. Archive Reference

Small footer codes that give embeds an "archival record" feel:

```
Ref: VOID-7x8k2 • Catalog §42.7
```

#### 3. Dimensional Markers

Subtle emoji indicators that suggest scale/importance:

- `◈` — Primary/featured
- `◇` — Secondary
- `·` — Tertiary/detail

#### 4. Monospace Data Blocks

Critical numbers and stats use monospace for precision:

```
`12,450` coins • `Lv.7` • `3/10` slots
```

---

## Color System

### Primary Palette

| State       | Hex       | Usage                                    |
| ----------- | --------- | ---------------------------------------- |
| **Void**    | `#1a1a2e` | Primary brand, default embeds            |
| **Success** | `#10b981` | Transactions complete, positive outcomes |
| **Warning** | `#f59e0b` | Cautions, pending states, low resources  |
| **Error**   | `#ef4444` | Failures, restrictions, critical issues  |
| **Info**    | `#6366f1` | Neutral information, help, navigation    |
| **Neutral** | `#6b7280` | Disabled states, timestamps, meta-info   |

### Economy-Specific Colors

| Context      | Hex       | Meaning                        |
| ------------ | --------- | ------------------------------ |
| **Gold**     | `#fbbf24` | Currency, wealth, treasure     |
| **Amethyst** | `#8b5cf6` | Perks, upgrades, progression   |
| **Obsidian** | `#18181b` | Bank, secure storage           |
| **Emerald**  | `#22c55e` | Gains, bonuses, positive delta |
| **Ruby**     | `#dc2626` | Losses, fees, negative delta   |

### Color Usage Rules

1. **One accent color per embed** — Don't mix success and warning in same embed
2. **Color = meaning** — Never use success green for non-success states
3. **Embed border matches context** — The sidebar color is the primary semantic indicator
4. **Dark theme optimized** — All colors tested against Discord dark mode

---

## Typography & Formatting

### Text Hierarchy

```
┌────────────────────────────────────────┐
│ LEVEL 1: Embed Title                   │  ← Bold by default
├────────────────────────────────────────┤
│ Level 2: **Field Names**               │  ← Bold markdown
├────────────────────────────────────────┤
│ Level 3: Regular body text             │  ← Plain text
├────────────────────────────────────────┤
│ Level 4: `Inline data` and *emphasis*  │  ← Code/italic
├────────────────────────────────────────┤
│ Level 5: Small footer/reference        │  ← Embed footer
└────────────────────────────────────────┘
```

### Formatting Conventions

| Element            | Format                    | Example          |
| ------------------ | ------------------------- | ---------------- |
| Numbers            | Code + locale separators  | `12,450`         |
| Currency           | Number + unit             | `12,450 coins`   |
| Percentages        | Number + %                | `85%`            |
| Levels             | Prefix + number           | `Lv.7` or `Nv.7` |
| Ratios             | Slash notation            | `3/10`           |
| Changes (positive) | Plus sign + green context | `+1,200`         |
| Changes (negative) | Minus sign + red context  | `-500`           |
| Dates              | Relative preferred        | `2 days ago`     |
| Times              | Relative + countdown      | `in 3h 24m`      |
| User mentions      | Native Discord            | `<@userId>`      |

### Line Length

- **Max 60 characters per line** in descriptions
- Break long text into multiple short lines
- Use line breaks `\n` generously for scannability

---

## Embed Structure

### Anatomy of a Standard Embed

```
┌──────────────────────────────────────────────────────────┐
│ [Author Icon] Author Name                                │  ← Optional context
├──────────────────────────────────────────────────────────┤
│ 🎯 Title — Short, Action-Oriented                        │  ← 1 emoji + title
├──────────────────────────────────────────────────────────┤
│ Brief description or status message.                     │
│ Max 2-3 lines.                                           │
├──────────────────────────────────────────────────────────┤
│ ◈ Primary Field          ◇ Secondary Field               │  ← Inline fields
│ `Main Value`             `Supporting Value`              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 📊 Breakdown Section                                     │  ← Full-width field
│ Base: 1,000                                              │
│ Bonus: +200                                              │
│ Tax: -60                                                  │
│ ────────────                                             │
│ **Net: 1,140**                                           │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [Footer icon] Footer text • Ref: ABC123    [Timestamp]   │
└──────────────────────────────────────────────────────────┘
```

### Field Layout Patterns

#### Pattern A: Stats Dashboard (3-column grid)

```
┌──────────┬──────────┬──────────┐
│ 💰 Hand  │ 🏦 Bank  │ 📊 Total │
│ `4,200`  │ `8,000`  │ `12,200` │
└──────────┴──────────┴──────────┘
```

#### Pattern B: Before/After (2-column)

```
┌─────────────────┬─────────────────┐
│ 📤 Before       │ 📥 After        │
│ `10,000 coins`  │ `11,200 coins`  │
└─────────────────┴─────────────────┘
```

#### Pattern C: Vertical List (single column)

```
┌────────────────────────────────────┐
│ 🎒 Inventory                       │
│ 📦 Iron Ore × 24                   │
│ 🪵 Oak Wood × 12                   │
│ 💎 Diamond × 1                     │
│ *...and 8 more items*              │
└────────────────────────────────────┘
```

### Field Limits

| Constraint            | Maximum    |
| --------------------- | ---------- |
| Fields per embed      | 25         |
| Inline fields per row | 3          |
| Field name length     | 256 chars  |
| Field value length    | 1024 chars |
| Total embed chars     | 6000 chars |
| Embeds per message    | 10         |

---

## Component Patterns

### Button Styles

| Style                 | Usage                     | Label Pattern                |
| --------------------- | ------------------------- | ---------------------------- |
| **Primary** (Blurple) | Main positive action      | `✓ Confirm`, `Buy`, `Claim`  |
| **Secondary** (Grey)  | Cancel, back, dismiss     | `← Back`, `✕ Cancel`, `Skip` |
| **Success** (Green)   | Confirm purchases, accept | `✓ Accept`, `✓ Equip`        |
| **Danger** (Red)      | Destructive actions       | `⚠ Sell All`, `🗑 Delete`    |
| **Link**              | External navigation       | `📖 View Guide`              |

### Button Label Rules

1. **Max 2 words** — `Buy Now` not `Purchase this item now`
2. **Verb-first** — `Claim Reward` not `Reward Claim`
3. **One emoji max** — Leading emoji only
4. **Consistent casing** — Title Case for all labels

### Select Menu Patterns

#### Item Selection

```
┌────────────────────────────────────────┐
│ ▼ Select an item to sell...            │ ← Placeholder
├────────────────────────────────────────┤
│ 📦 Iron Ore (×24) — 50 coins each      │ ← Option
│ 🪵 Oak Wood (×12) — 25 coins each      │
│ 💎 Diamond (×1) — 5,000 coins          │
└────────────────────────────────────────┘
```

#### Category Selection

```
┌────────────────────────────────────────┐
│ ▼ Choose a category...                 │
├────────────────────────────────────────┤
│ ⚔️ Weapons — Attack equipment          │
│ 🛡️ Armor — Defense equipment           │
│ 💍 Accessories — Bonus stats           │
│ 🧪 Consumables — One-time use items    │
└────────────────────────────────────────┘
```

### Select Menu Rules

1. **Max 25 options** — Paginate if more needed
2. **Descriptive placeholders** — Tell user what to do
3. **Option descriptions** — Add context (price, quantity, etc.)
4. **Logical ordering** — Alphabetical, by value, or by relevance

---

## Data Visualization

### Progress Bars

#### Standard Bar (10 segments)

```
XP Progress: ████████░░ 80%
```

#### Compact Bar (5 segments)

```
[████░] 80%
```

#### Minimal (inline)

```
▓▓▓▓░ 80%
```

### Code Implementation

```typescript
function renderBar(percent: number, length = 10): string {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}
```

### Quantity Displays

#### Threshold Indicators

```
Stock: ∞     ← Unlimited
Stock: 42    ← Normal
Stock: ⚠ 3   ← Low warning
Stock: — 0   ← Out of stock
```

#### Compact Tables

```
┌─────────────┬────────┬────────┐
│ Item        │ Qty    │ Value  │
├─────────────┼────────┼────────┤
│ Iron Ore    │ ×24    │ 1,200  │
│ Oak Wood    │ ×12    │   300  │
│ Diamond     │ ×1     │ 5,000  │
├─────────────┼────────┼────────┤
│ **Total**   │        │ 6,500  │
└─────────────┴────────┴────────┘
```

Rendered as monospace in Discord:

```
`Item         Qty    Value`
`─────────────────────────`
`Iron Ore     ×24    1,200`
`Oak Wood     ×12      300`
`Diamond      ×1     5,000`
`─────────────────────────`
`Total              6,500`
```

### Comparison Displays

#### Delta Format

```
Balance: 10,000 → 11,200 (+1,200) ✓
```

#### Change Indicator

```
💰 12,450 coins (+1,200 from yesterday)
```

---

## Interaction Flows

### Flow Pattern: Confirmation

```
┌─────────────────────────────────────────────────────────┐
│                    CONFIRMATION FLOW                    │
└─────────────────────────────────────────────────────────┘

Step 1: User initiates action
        ↓
Step 2: Show confirmation embed
        ┌────────────────────────────────────────┐
        │ ⚠️ Confirm Purchase                    │
        │                                        │
        │ Buy **Iron Pickaxe** for `2,500` coins?│
        │                                        │
        │ Your balance: `12,450` coins           │
        │ After purchase: `9,950` coins          │
        │                                        │
        │ [✓ Confirm] [✕ Cancel]                 │
        └────────────────────────────────────────┘
        ↓
Step 3: Process & show result
        ┌────────────────────────────────────────┐
        │ ✅ Purchase Complete                   │
        │                                        │
        │ You bought **Iron Pickaxe**            │
        │                                        │
        │ Paid: `2,500` coins                    │
        │ Balance: `9,950` coins                 │
        └────────────────────────────────────────┘
```

### Flow Pattern: Pagination

```
┌─────────────────────────────────────────────────────────┐
│                    PAGINATION FLOW                      │
└─────────────────────────────────────────────────────────┘

Initial: Show first page
         ┌────────────────────────────────────────┐
         │ 🎒 Inventory (Page 1/5)                │
         │                                        │
         │ 📦 Iron Ore × 24                       │
         │ 🪵 Oak Wood × 12                       │
         │ 💎 Diamond × 1                         │
         │ ... (showing 10 of 47)                 │
         │                                        │
         │ [◀ Prev] [Page 1/5] [Next ▶]           │
         └────────────────────────────────────────┘
```

### Flow Pattern: Multi-Step Selection

```
┌─────────────────────────────────────────────────────────┐
│                  MULTI-STEP SELECTION                   │
└─────────────────────────────────────────────────────────┘

Step 1: Category Selection
        ┌────────────────────────────────────────┐
        │ 👤 Equipment Slots                     │
        │                                        │
        │ [▼ Select a slot to equip...]          │
        └────────────────────────────────────────┘
        ↓
Step 2: Item Selection
        ┌────────────────────────────────────────┐
        │ ⚔️ Weapon Slot                         │
        │                                        │
        │ Currently equipped: Iron Sword         │
        │                                        │
        │ [▼ Select an item to equip...]         │
        │                                        │
        │ [← Back]                               │
        └────────────────────────────────────────┘
        ↓
Step 3: Confirmation (if needed)
        ↓
Step 4: Result
```

### State Indicators for Flows

| State           | Visual Pattern                         |
| --------------- | -------------------------------------- |
| Processing      | `⏳ Processing...` (embed description) |
| Success         | Green embed + `✅` emoji title         |
| Partial Success | Yellow embed + `⚠️` emoji              |
| Error           | Red embed + `❌` emoji                 |
| Timeout         | Grey embed + `⏰` emoji                |

---

## Microcopy Guidelines

### Voice & Tone

| Attribute       | Description                 | Example                                                           |
| --------------- | --------------------------- | ----------------------------------------------------------------- |
| **Concise**     | Minimum words needed        | "Claimed 500 coins" not "You have successfully claimed 500 coins" |
| **Direct**      | Active voice, clear subject | "You earned 500 coins" not "500 coins were earned"                |
| **Atmospheric** | Subtle thematic touches     | "Collected from the void" not "Received from system"              |
| **Helpful**     | Guides next action          | "Use /shop to spend" after earning                                |

### Thematic Vocabulary

Instead of → Use:

- "System" → "Archive"
- "Database" → "Ledger"
- "Collected" → "Gathered from the depths"
- "Error" → "Anomaly detected"
- "Maximum" → "Threshold reached"
- "Created" → "Manifested"
- "Deleted" → "Consumed by the void"
- "Loading" → "Consulting the archives..."

### Error Message Patterns

```
❌ {What went wrong}
💡 {What to do about it}
```

Examples:

```
❌ Insufficient funds — you need 2,500 more coins.
💡 Try /work or /daily to earn more.
```

```
❌ Item not found in your inventory.
💡 Use /inventory to see what you have.
```

### Success Message Patterns

```
✅ {What succeeded}
📊 {Key stats change}
💡 {Optional next step}
```

Example:

```
✅ Daily Claimed
📊 +1,500 coins (streak: 7 days 🔥)
💡 Come back tomorrow to keep your streak!
```

---

## Implementation Templates

### Template: Transaction Result

```typescript
const embed = new Embed()
  .setColor(Colors.Success)
  .setTitle("✅ Transaction Complete")
  .setDescription("Your purchase has been processed.")
  .addFields(
    { name: "📦 Item", value: "**Iron Pickaxe**", inline: true },
    { name: "💰 Cost", value: "`2,500` coins", inline: true },
    { name: "📊 Balance", value: "`10,000` → `7,500`", inline: true },
  )
  .setFooter({ text: "Ref: TXN-7x8k2 • Use /inventory to view items" });
```

### Template: Profile Overview

```typescript
const embed = new Embed()
  .setColor(Colors.Info)
  .setAuthor({ name: username, iconUrl: avatarUrl })
  .setTitle("👤 Economy Profile")
  .setDescription("Account active • `Lv.12`")
  .addFields(
    { name: "💰 Balance", value: "`42,500` coins", inline: true },
    { name: "🏦 Bank", value: "`150,000` coins", inline: true },
    { name: "⭐ Rep", value: "`+127`", inline: true },
    { name: "📈 Progress", value: "████████░░ 82% to Lv.13", inline: false },
    { name: "🎒 Inventory", value: "24 unique items (47 total)", inline: true },
    { name: "🏆 Achievements", value: "12/50 unlocked", inline: true },
  )
  .setFooter({
    text: "Use /balance for detailed currency • /inventory for items",
  });
```

### Template: Error State

```typescript
const embed = new Embed()
  .setColor(Colors.Error)
  .setTitle("❌ Transaction Failed")
  .setDescription(
    "Insufficient funds to complete this purchase.\n\n" +
      "💰 Required: `2,500` coins\n" +
      "💰 Available: `1,200` coins\n" +
      "💰 Shortfall: `1,300` coins",
  )
  .setFooter({ text: "💡 Try /work or /daily to earn more coins" });
```

### Template: Paginated List

```typescript
const embed = new Embed()
  .setColor(Colors.Info)
  .setTitle("🏪 Store Catalog")
  .setDescription("Browse available items for purchase.")
  .addFields(
    {
      name: "⭐ Featured",
      value: "🔥 **Dragon Blade** — ~~5,000~~ `3,500` coins (30% OFF)",
      inline: false,
    },
    {
      name: "⚔️ Weapons",
      value:
        "• `sword_iron` **Iron Sword** — `500` coins\n" +
        "• `axe_steel` **Steel Axe** — `750` coins\n" +
        "• `bow_oak` **Oak Bow** — `600` coins",
      inline: false,
    },
  )
  .setFooter({ text: "Page 1/3 • /store-buy item:<id> to purchase" });
```

---

## Consistency Checklist

Before shipping any new interface, verify:

- [ ] **Color matches semantic meaning** (success=green, error=red, etc.)
- [ ] **Numbers use code formatting** (backticks around values)
- [ ] **Currency shows unit** (e.g., "coins" after number)
- [ ] **Fields use 3-column grid** where appropriate
- [ ] **Footer includes ref code** for transaction embeds
- [ ] **Footer includes helpful hint** for informational embeds
- [ ] **Emoji used sparingly** (1 per field name max)
- [ ] **Action buttons use correct styles** (confirm=success, cancel=secondary)
- [ ] **Progress bars consistent length** (10 chars standard)
- [ ] **Error messages include solution** (💡 hint pattern)

---

## Migration Notes

When updating existing interfaces to match this guide:

1. **Phase 1**: Update colors to new palette
2. **Phase 2**: Standardize field layouts (3-column grids)
3. **Phase 3**: Add monospace formatting to numbers
4. **Phase 4**: Rework error messages with solution hints
5. **Phase 5**: Update footers with ref codes and hints
6. **Phase 6**: Audit button labels and styles
7. **Phase 7**: Final consistency pass

---

_Document Version: 1.0.0_
_Last Updated: 2026-02-01_
_Maintained by: UI/UX Guild_
