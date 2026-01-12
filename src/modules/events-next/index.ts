/**
 * Demo module for the proposed "no internal hooks" event model.
 *
 * Seyfert notes (how it actually works):
 * - Client.loadEvents loads compiled files from the events directory (see seyfert.config).
 * - Each event name maps to ONE handler in client.events.values (last one wins).
 * - EventHandler.runEvent builds the hook payload and calls event.run(hook, client, shardId).
 *
 * This module does NOT replace the current system. It wraps MESSAGE_CREATE at runtime
 * to add a tiny in-memory demo registry, then delegates to the original handler so
 * existing listeners keep working.
 */
import type { ResolveEventParams, UsingClient, GatewayEvents } from "seyfert";

type MessageCreateArgs = ResolveEventParams<"messageCreate">;

type DemoEntry = {
  key: string;
  userId: string;
  channelId: string;
  guildId?: string | null;
  expiresAt: number;
  timeout: NodeJS.Timeout;
};

type MessageCreateEvent = {
  data: { name: "messageCreate"; once?: boolean };
  run: (...args: MessageCreateArgs) => unknown;
};

const DEMO_TTL_MS = 60_000;
const activeDemos = new Map<string, DemoEntry>();

let wrapperInstalled = false;
let originalMessageCreate: MessageCreateEvent | null = null;
let installedClient: UsingClient | null = null;

const makeKey = (userId: string, channelId: string, guildId?: string | null): string =>
  `${guildId ?? "dm"}:${channelId}:${userId}`;

const getMessageCreateKey = (): GatewayEvents => "MESSAGE_CREATE";

function installWrapper(client: UsingClient): void {
  if (wrapperInstalled) return;

  installedClient = client;
  const key = getMessageCreateKey();
  const current = client.events.values[key] as MessageCreateEvent | undefined;
  if (current) {
    originalMessageCreate = current;
  }

  const wrapped: MessageCreateEvent = {
    data: { name: "messageCreate", once: current?.data?.once ?? false },
    run: async (...args: MessageCreateArgs) => {
      const original = originalMessageCreate;
      await handleDemoMessageCreate(...args);
      if (original?.run) {
        await original.run(...args);
      }
    },
  };

  client.events.values[key] = wrapped as any;
  wrapperInstalled = true;
}

function restoreWrapper(): void {
  if (!wrapperInstalled || !installedClient) return;

  const key = getMessageCreateKey();
  if (originalMessageCreate) {
    installedClient.events.values[key] = originalMessageCreate as any;
  } else {
    delete installedClient.events.values[key];
  }

  wrapperInstalled = false;
  originalMessageCreate = null;
  installedClient = null;
}

function clearEntry(entry: DemoEntry): void {
  clearTimeout(entry.timeout);
  activeDemos.delete(entry.key);
  if (activeDemos.size === 0) {
    restoreWrapper();
  }
}

async function handleDemoMessageCreate(...args: MessageCreateArgs): Promise<void> {
  const message = args[0] as any;
  const client = args[1] as UsingClient;
  if (!message?.author?.id || message?.author?.bot) return;
  if (!message.channelId) return;

  const key = makeKey(message.author.id, message.channelId, message.guildId ?? null);
  const entry = activeDemos.get(key);
  if (!entry) return;

  clearEntry(entry);

  try {
    await message.reply({
      content: `new-event: captured message via direct Seyfert handler. content="${message.content ?? ""}"`,
    });
  } catch (error) {
    client.logger?.debug?.("[events-next] demo reply failed", { error });
  }
}

export type StartDemoResult =
  | { status: "started"; expiresAt: number }
  | { status: "already-active"; expiresAt: number };

export type StopDemoResult = { status: "stopped" } | { status: "not-found" };

export function startMessageCreateDemo(
  client: UsingClient,
  params: {
    userId: string;
    channelId: string;
    guildId?: string | null;
    timeoutMs?: number;
  },
): StartDemoResult {
  installWrapper(client);

  const timeoutMs = params.timeoutMs ?? DEMO_TTL_MS;
  const key = makeKey(params.userId, params.channelId, params.guildId ?? null);
  const existing = activeDemos.get(key);
  if (existing) {
    return { status: "already-active", expiresAt: existing.expiresAt };
  }

  const expiresAt = Date.now() + timeoutMs;
  const timeout = setTimeout(() => {
    const entry = activeDemos.get(key);
    if (entry) clearEntry(entry);
  }, timeoutMs);

  activeDemos.set(key, {
    key,
    userId: params.userId,
    channelId: params.channelId,
    guildId: params.guildId ?? null,
    expiresAt,
    timeout,
  });

  return { status: "started", expiresAt };
}

export function stopMessageCreateDemo(params: {
  userId: string;
  channelId: string;
  guildId?: string | null;
}): StopDemoResult {
  const key = makeKey(params.userId, params.channelId, params.guildId ?? null);
  const entry = activeDemos.get(key);
  if (!entry) return { status: "not-found" };

  clearEntry(entry);
  return { status: "stopped" };
}
