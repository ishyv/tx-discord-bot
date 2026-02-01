# Community Operations

Guide on interaction flows with members: support tickets, community offers, and activity statistics (TOPs).

## Ticket System

- **Flow**: Allows users to open private communication channels with staff through an interactive panel.
- **Categorization**: Supports multiple categories (technical support, reports, questions) that direct the ticket to the appropriate personnel.
- **Atomic Management**: The system ensures that each user has a limited number of active tickets and that all channels are recorded in the database to avoid "orphan channels."
- **Cleanup**: Includes logic to close and archive tickets automatically or manually, keeping the server organized.

## Offer Management

- **Review Flow**: Offers submitted by users go through a curation process. Moderators can approve, reject, or request changes before the offer becomes public.
- **Domain State**: Each offer maintains a state (pending, approved, rejected) and a history of decisions (who reviewed it and why).
- **Automatic Publication**: Once approved, the system takes care of publishing the offer in the corresponding channels with a professional and consistent format.

## Automatic Autoroles

- **Triggers**: Role assignment based on automatic events such as server age, reputation level, or interaction with specific messages (reactions).
- **Temporality**: Supports temporary roles that are automatically withdrawn after a defined period, managed by an internal scheduler.
- **Auditing**: Each role assignment or withdrawal is recorded with its reason, facilitating supervision by the staff team.

## Statistics and TOPs

- **Data Collection**: Passively monitors activity (messages, emojis, reputation) to generate periodic reports.
- **Time Windows**: Data is grouped into configurable periods (e.g., weekly). At the end of the period, a visual summary is generated and counters are reset.
- **Transparency**: Encourages community participation by highlighting the most active members and content in an automated way.
