# Economy and Inventory

Reference framework to understand the logic of the economic system and item management.

## Currency Design

- **Currency Registry**: The bot uses a flexible registry system that allows defining multiple types of currencies. Each currency defines its own validation rules, limits, and behavior (e.g., if it allows negative balances or if it has sub-balances like bank/hand).
- **Decoupling**: The arithmetic logic of each currency is isolated from the transaction engine, facilitating the addition of new currencies without the risk of affecting the economic core.

## Transaction Engine

- **Atomicity**: All economic operations are executed through a transaction engine that guarantees changes are atomic. If part of the transaction fails (e.g., insufficient funds for a cost), the entire operation is reverted.
- **Pre-simulation**: Before persisting any change, the engine simulates the operation to validate that the resulting state is legal according to the currency rules.
- **Concurrency**: It uses optimistic concurrency techniques to handle multiple simultaneous transactions on the same user, ensuring balance integrity even in high-activity situations.

## Hybrid Work Payout Model

The `/work` command implements a hybrid payout system designed to balance inflation control with user incentives:

### Payout Structure
- **Base Mint**: A guaranteed amount of newly minted currency (always paid)
- **Treasury Bonus**: An additional amount paid from the guild's `works` sector (only if funds available)

### Benefits
- **Predictable Inflation**: Only the base mint contributes to inflation, making it easier to control
- **Treasury Incentives**: Users are incentivized to keep the `works` sector funded for bonus payouts
- **Always Available**: Users can always work and earn the base amount, even with empty treasury
- **Audit Trail**: Each payout is audited with `baseMint` and `bonusFromWorks` metadata for transparency

## Item Inventory

- **Definitions**: Items are managed through static definitions that dictate their behavior (max stack, rarity, effects).
- **Item Transactions**: Similar to the economy, adding or subtracting items is done atomically. The system verifies space or quantity availability before proceeding with the database change.
- **Flexible Persistence**: Inventory and currency data are stored in open structures that allow the format to evolve without the need for frequent database migrations.

## Interaction with UI

- Economy and inventory commands act as simple interfaces that send requests to the engine. This ensures that all validations and business rules are applied consistently, regardless of whether the action comes from a chat command, a button, or an automatic bot system.
