# Moderation and Reputation

Design framework for server protection systems and disciplinary management.

## AutoMod

- **Philosophy**: Act in real-time on malicious content without blocking the bot's main execution.
- **Detection**: Uses a pipeline that combines fast text filters for spam and common scams, along with image analysis via OCR to detect visual scams.
- **Optimization**: Employs hashing techniques to remember already processed images and minimize the use of costly resources.
- **Staff-Centric**: Instead of aggressively deleting content silently, the system prioritizes alerting the moderation team through dedicated log channels, allowing informed human intervention.

- **Traceability**: Each warning includes metadata about the moderator, the reason, and a unique identifier for its management or appeal.

## Sanctions History (Cases)

- **Purpose**: Provide a unified and persistent record of all disciplinary actions (Bans, Kicks, Mutes, Warns) per server.
- **Access**: Consultable through the `/cases` command, allowing staff to quickly review backgrounds.
- **Technical Detail**: To delve into its architecture and operation, see [Sanctions History](./sanctions-history.md).

## Reputation System

- **Automatic Detection**: The bot can identify behaviors deserving of reputation (based on keywords or detected help) and issue review requests.
- **Human Validation**: To avoid abuse and spam, automatic requests must be confirmed by staff.
- **Manual Commands**: Allows direct management of reputation points by authorized users and moderators.

## Limits and Overrides

- **Role Policies**: The system allows defining specific permissions per role that override Discord's native permissions.
- **Abuse Control**: Implements time windows and maximum action quotas to prevent even users with permissions from performing damaging or accidental mass actions.

## Auditing and Logs

- **Centralization**: All moderation actions, message changes, and voice events are channeled through a unified logging system.
- **Decoupling**: Logs are triggered independently of the command logic, ensuring that a record always remains regardless of how the action was executed.
