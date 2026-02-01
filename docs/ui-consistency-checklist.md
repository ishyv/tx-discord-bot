# UI Consistency Checklist

> **Pre-ship verification for all Discord bot interfaces**

Use this checklist when creating or updating any user-facing interface.

---

## Quick Reference

```
✅ = Required   ⚠️ = Recommended   💡 = Nice to have
```

---

## 1. Color Usage

| Check | Requirement                                                                  |
| ----- | ---------------------------------------------------------------------------- |
| ✅    | Embed border color matches semantic meaning (success=green, error=red, etc.) |
| ✅    | Only ONE accent color per embed (no mixing success and warning)              |
| ✅    | Using colors from `UIColors` constant, not raw hex values                    |
| ⚠️    | Tested against Discord dark mode (colors visible/readable)                   |

**Quick Reference:**

- `success` (#10b981) - Positive outcomes, completed transactions
- `error` (#ef4444) - Failures, restrictions, denials
- `warning` (#f59e0b) - Cautions, pending states, confirmations
- `info` (#6366f1) - Neutral information, navigation
- `gold` (#fbbf24) - Currency, treasure, economy primary

---

## 2. Embed Structure

| Check | Requirement                                           |
| ----- | ----------------------------------------------------- |
| ✅    | Title has exactly ONE emoji prefix                    |
| ✅    | Title is action-oriented (verb or result state)       |
| ✅    | Description is 2-3 lines max                          |
| ✅    | Fields use 3-column inline grid where appropriate     |
| ⚠️    | Author line used for user context (avatar + username) |
| ✅    | Footer includes hint or ref code                      |
| ⚠️    | Timestamp only on time-sensitive embeds               |

**Title Patterns:**

```
✅ Good: "✅ Purchase Complete"
✅ Good: "💰 Your Balance"
❌ Bad: "✅ 🎉 Purchase Complete! 🛒"
❌ Bad: "Balance Information Display"
```

---

## 3. Number Formatting

| Check | Requirement                                       |
| ----- | ------------------------------------------------- |
| ✅    | All numbers use backtick code formatting          |
| ✅    | Numbers use locale separators (12,450 not 12450)  |
| ✅    | Currency shows unit after number (`12,450 coins`) |
| ✅    | Percentages formatted as `85%` not `85 percent`   |
| ✅    | Changes show sign (`+1,200` or `-500`)            |
| ⚠️    | Large numbers abbreviated (`1.2M` for 1,200,000+) |

**Code Examples:**

```typescript
// ✅ Correct
formatCoins(12450); // → `12,450` coins
formatDelta(+500); // → +500
formatLevel(12) // → `Lv.12`
// ❌ Incorrect
`${amount} coins`; // → "12450 coins" (missing separators)
```

---

## 4. Typography Hierarchy

| Check | Requirement                                          |
| ----- | ---------------------------------------------------- |
| ✅    | Field names use bold implicitly (embed handles this) |
| ⚠️    | Key values/items in field values use `**bold**`      |
| ✅    | Inline data uses `backticks`                         |
| ⚠️    | Supplementary info uses _italics_                    |
| ✅    | Max 60 characters per line in descriptions           |

**Example:**

```
📦 **Iron Pickaxe** × 1 added to inventory

💰 Paid: `2,500` coins
📊 Balance: `9,950` coins

*Use /equip to equip your new item*
```

---

## 5. Field Layout

| Check | Requirement                                                |
| ----- | ---------------------------------------------------------- |
| ✅    | Related stats grouped in 3-column inline rows              |
| ✅    | Breakdowns use full-width (non-inline) fields              |
| ✅    | List items in single full-width field, not multiple fields |
| ⚠️    | Max 6 fields per embed (ideally)                           |
| ✅    | Field names are short (1-3 words)                          |

**Correct Layouts:**

```
┌─────────┬─────────┬─────────┐
│ Inline  │ Inline  │ Inline  │  ← Stats row
└─────────┴─────────┴─────────┘
┌─────────────────────────────┐
│ Full Width Field            │  ← Breakdown/list
└─────────────────────────────┘
```

---

## 6. Progress Visualization

| Check | Requirement                                           |
| ----- | ----------------------------------------------------- |
| ✅    | Progress bars use 10 characters standard              |
| ✅    | Progress bars use `█` and `░` characters              |
| ✅    | Percentage shown after bar                            |
| ⚠️    | Context given after percentage (e.g., "82% to Lv.13") |

**Format:**

```
████████░░ 80% — 4,000 / 5,000 XP to Lv.13
```

---

## 7. Button Styles

| Check | Requirement                                        |
| ----- | -------------------------------------------------- |
| ✅    | Primary/positive actions use Success (green) style |
| ✅    | Cancel/back/dismiss use Secondary (grey) style     |
| ✅    | Destructive actions use Danger (red) style         |
| ✅    | Button labels are max 2 words                      |
| ✅    | Button labels are verb-first                       |
| ✅    | Only ONE leading emoji per button (optional)       |

**Button Label Patterns:**

```
✅ Good: "✓ Confirm", "Buy Now", "← Back"
❌ Bad: "Click here to confirm your purchase"
❌ Bad: "✅ 🎉 Confirm Purchase! 🛒"
```

---

## 8. Select Menus

| Check | Requirement                                                 |
| ----- | ----------------------------------------------------------- |
| ✅    | Placeholder tells user what to do                           |
| ✅    | Options have descriptions with context                      |
| ⚠️    | Options logically ordered (alphabetical/by value/relevance) |
| ✅    | Max 25 options (paginate if more)                           |

**Format:**

```
▼ Select an item to sell...
├─ 📦 Iron Ore (×24) — 50 coins each
├─ 🪵 Oak Wood (×12) — 25 coins each
└─ 💎 Diamond (×1) — 5,000 coins
```

---

## 9. Footer Content

| Check | Requirement                          |
| ----- | ------------------------------------ |
| ✅    | Transaction embeds include ref code  |
| ✅    | Info embeds include navigation hints |
| ⚠️    | Footer parts separated by `•`        |
| 💡    | Footer hints use 💡 emoji prefix     |

**Format:**

```
Ref: TXN-7x8k2 • 💡 /inventory to view items
```

---

## 10. Error Messages

| Check | Requirement                                       |
| ----- | ------------------------------------------------- |
| ✅    | Error title clearly states what failed            |
| ✅    | Error description explains the problem            |
| ✅    | Error includes 💡 solution hint                   |
| ✅    | Using `ErrorMessages` constants for common errors |

**Pattern:**

```
❌ Insufficient Funds

You need `2,500` coins but only have `1,200`.

💡 Try /work or /daily to earn more coins.
```

---

## 11. Microcopy & Voice

| Check | Requirement                                       |
| ----- | ------------------------------------------------- |
| ✅    | Language is concise (minimum words needed)        |
| ✅    | Active voice used ("You earned" not "was earned") |
| ⚠️    | Thematic vocabulary where appropriate             |
| ✅    | Consistent terminology across bot                 |

**Thematic Substitutions:**

- "Error" → "Anomaly detected"
- "Maximum" → "Threshold reached"
- "Collected" → "Gathered from the depths"
- "Loading" → "Consulting the archives..."

---

## 12. Accessibility

| Check | Requirement                                             |
| ----- | ------------------------------------------------------- |
| ⚠️    | Don't rely solely on color to convey meaning            |
| ✅    | Include text indicators alongside emoji                 |
| ⚠️    | Emoji are supplementary, not required for understanding |
| 💡    | Consider screen reader interpretation                   |

---

## Pre-Commit Checklist

Before committing any interface change, verify:

```
[ ] 1. Imported utilities from design-system.ts
[ ] 2. Used color from UIColors constant
[ ] 3. Numbers formatted with formatMoney/formatCoins
[ ] 4. Progress bar uses renderProgressBar()
[ ] 5. Footer built with buildFooter()
[ ] 6. Error messages include solutions
[ ] 7. Button labels are 2 words max
[ ] 8. Tested in Discord (not just code review)
```

---

## Common Mistakes

### ❌ Mistake: Multiple emoji in titles

```typescript
// ❌ Bad
.setTitle("✅ 🎉 Daily Claimed! 🎁")

// ✅ Good
.setTitle("🎁 Daily Claimed")
```

### ❌ Mistake: Raw numbers without formatting

```typescript
// ❌ Bad
value: `${amount} coins`;

// ✅ Good
value: formatCoins(amount);
```

### ❌ Mistake: Vague error messages

```typescript
// ❌ Bad
buildErrorEmbed({ message: "Something went wrong." });

// ✅ Good
buildErrorEmbed({
  title: "Insufficient Funds",
  message: "You need 2,500 coins but only have 1,200.",
  solution: "Try /work or /daily to earn more coins.",
});
```

### ❌ Mistake: Inconsistent button labels

```typescript
// ❌ Bad
.setLabel("Click here to confirm this purchase action")

// ✅ Good
.setLabel("✓ Confirm")
```

### ❌ Mistake: Missing footer hints

```typescript
// ❌ Bad (no footer)

// ✅ Good
.setFooter({ text: "💡 /inventory to view your items" })
```

---

## Review Questions

When reviewing UI PRs, ask:

1. **Would a new user understand this in < 3 seconds?**
2. **Does the color accurately represent the state?**
3. **Are numbers scannable (formatted + code blocks)?**
4. **Does the error message help the user fix the issue?**
5. **Is there a clear next action hinted?**
6. **Would this look good in a screenshot?**

---

_Document Version: 1.0.0_
_Last Updated: 2026-02-01_
