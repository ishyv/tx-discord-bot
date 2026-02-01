# Server Configuration

Guide on the systems that govern the personalization and limits of each server (guild).

## Features and Toggles

- **Catalog**: The bot has a catalog of functions (e.g., economy, tickets, automod) that can be individually enabled or disabled.
- **Management**: Features are controlled through the centralized configuration system (`ConfigStore`), which ensures that changes propagate consistently and efficiently through caching.
- **Middleware**: The system uses middlewares to intercept commands that depend on disabled features, responding to the user with an informative notice instead of executing the logic.

## Managed Channels

- **Core Channels**: These are critical channels for the operation of specific modules (logs, tickets, suggestions). Their configuration is centralized to avoid broken references.
- **Managed Channels**: The bot can create and manage channels dynamically. The system maintains a record of these channels to facilitate their cleanup or update.
- **Sanitation**: Includes automatic processes to detect channels manually deleted on Discord and clean their references in the bot configuration.

## Managed Roles and Limits

- **Role Governance**: Allows defining usage policies for specific server roles.
- **Overrides**: Ability to authorize or deny specific moderation actions based on the user's role, independent of their native permissions.
- **Usage Quotas**: Implements frequency limits to prevent spam or excessive use of sensitive commands, using sliding time windows.

## Cooldowns and Spam Protection

- **User Bucket**: Manages individual waiting times between command executions to prevent abuse.
- **Middleware**: Cooldown control is applied transversally before the command reaches its main logic, ensuring uniform protection across the bot.
