<div align="center">

# ◼️ Tx - Seeker

**A Discord bot with too many features, probably. Built mostly for moderation and a questionable economy system.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)  
[![Seyfert](https://img.shields.io/badge/Powered%20by-Seyfert-5865F2?logo=discord)](https://seyfert.dev)  
[![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?logo=mongodb)](https://www.mongodb.com/)  
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./license)

</div>

---

## What Is This

**Tx - Seeker** is a Discord bot. It moderates, it has an economy system, it plays some games, and it tries to look more complex than it is. Built in TypeScript using the [Seyfert](https://seyfert.dev) framework.

Useful for people running servers who want:

- A economy for some reason
- Quests, XP, and other game-like distractions
- AI responses if talking to real people isn’t cutting it
- MASSIVE moderation tools

## Features 

### Moderation

- Ban, kick, mute, warn, etc. The usual.
- Role-based permission limits.
- Auto-mod: fights links, shorteners, shady domains
- Keeps logs that oneone ever reads

### Economy
- Multiple currencies. For what? dunno
- Sectors: global, work, trade, tax—simulate capitalism badly
- Daily rewards to keep users clicking things
- Buy/sell/craft/trade items 
- Transfer system with adjustable tax, like in real life 

### Game / RPG-ish parts

- Quests: daily/weekly/whatever—you do tasks, get stuff
- Achievements and titles for your fake accomplishments
- XP and leveling system 
- Server perks  
- Minigames: coinflip, trivia and more to come

### AI (CLANKER) Features 

- Chat bots using OpenAI or Gemini (or nothing)
- Auto-replies in threads 
- "Reputation detection"—it tries, okay?

### Utility

- Ticket system (One of the best ticket systems ever, allegedly)
- Suggestions and starboard 
- Role management with super-duper powerful rules
- Can't remember everything, but it's real man. 

---

## Setup 

### Requirements
- JS runtime, preferably [Bun](https://bun.sh/)
- MongoDB instance running somewhere (local or not) 

### Install It

```bash
git clone https://github.com/ishyv/tx-seeker.git
cd tx-seeker
bun install

cp env.example .env
# Then, yes, you have to actually edit the .env file

bun run build
bun start
```

### Content Authoring CLI (Quests + Items)

A Python CLI is available for editing RPG packs without the web UI:

```bash
bun run content:cli --help
# or
python tools/rpg_content_cli.py --help
```

Quick examples:

```bash
python tools/rpg_content_cli.py validate
python tools/rpg_content_cli.py quests list
python tools/rpg_content_cli.py quests set starter_miner_gather_pyrite --path steps[0].itemId --value moon_silver_ore
python tools/rpg_content_cli.py items list
```

Detailed guide: [`docs/CONTENT_CLI.md`](./docs/CONTENT_CLI.md)

### Environment Variables

```env
TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
MONGO_URI=mongodb://localhost:27017
DB_NAME=txseeker

# Optional AI keys. Or don’t. That’s valid.
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
```


## 📖 Documentation (It’s There, Technically)

- [Architecture Overview](./docs/arquitectura.md)
- [Database Layer](./docs/database.md)
- [Economy System](./docs/economia-e-inventario.md)
- [Quest System](./docs/sistema-misiones.md)
- [AI System](./docs/sistema-ia.md)
- [Event Bus](./docs/event-bus.md)


## 🗪 License

MIT. Do whatever you want, basically. Just don’t blame me.

---

<div align="center">

Built with indifference and tons of vibe coding by the Tx - Seeker team (me).

</div>
