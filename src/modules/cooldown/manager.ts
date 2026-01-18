/**
 * Purpose: Provide a minimal, reliable cooldown store for commands.
 * Context: The cooldown middleware calls this manager before command execution.
 * Dependencies: Seyfert command registry (client.commands), perf_hooks for monotonic time.
 * Invariants:
 * - Keys are `${command}:${type}:${target}` and must stay stable across releases.
 * - All timestamps are monotonic (performance.now), never Date.now.
 * - Storage is process-local and not shared across shards.
 * Gotchas:
 * - If commands are not registered, cooldowns are skipped for that command.
 * - This does not enforce cooldowns by itself; it relies on middleware usage.
 */
import { performance } from "node:perf_hooks";
import type { AnyContext, SubCommand, UsingClient } from "seyfert";

export enum CooldownType {
  User = "user",
  Guild = "guild",
  Channel = "channel",
}

/**
 * Tracks command cooldown windows for a single process.
 *
 * Params:
 * - client: Seyfert client that exposes the command registry.
 *
 * Side effects: Mutates an in-memory map when commands are used.
 *
 * Invariants:
 * - Entries are only removed lazily (on read).
 * - The same command name must be used by all callers for consistent keys.
 */
export class CooldownManager {
  // WHY: In-memory map keeps behavior deterministic and avoids cache drift.
  private readonly cooldowns = new Map<string, CooldownEntry>();

  constructor(public readonly client: UsingClient) {}

  private buildKey(name: string, type: CooldownType, target: string) {
    return `${name}:${type}:${target}`;
  }

  private now(): number {
    // WHY: monotonic time prevents resets on system clock changes.
    return performance.now();
  }

  private resolveTarget(context: AnyContext, type: CooldownType): string {
    switch (type) {
      case "user":
        return context.author.id;
      case "guild":
        return context.guildId ?? context.author.id;
      case "channel":
        return context.channelId ?? context.author.id;
      default:
        return context.author.id;
    }
  }

  /**
   * Locate cooldown metadata for a command or subcommand by name.
   *
   * WHY: Seyfert exposes a flat registry; we need to map subcommand names
   * back to their cooldown config (or inherit from the parent command).
   *
   * Returns undefined when commands are not loaded yet (cooldown skipped).
   */
  private getCommandData(
    name: string,
    guildId?: string,
  ): [string, CooldownProps] | undefined {
    if (!this.client.commands?.values?.length) return;

    for (const command of this.client.commands.values) {
      if (!("cooldown" in command)) continue;
      if (guildId && !command.guildId?.includes(guildId)) continue;

      if (command.name === name) {
        return [command.name, command.cooldown!];
      }

      if ("options" in command) {
        const option = command.options?.find(
          (x): x is SubCommand => x.name === name,
        );
        if (option) {
          return [option.name, option.cooldown ?? command.cooldown!];
        }
      }
    }
    return undefined;
  }

  private getUses(props: CooldownProps, use?: keyof UsesProps): number {
    const raw = props.uses[use ?? "default"];
    if (typeof raw !== "number" || Number.isNaN(raw)) return 1;
    return Math.max(1, Math.floor(raw));
  }

  private readEntry(key: string, now: number): CooldownEntry | undefined {
    const entry = this.cooldowns.get(key);
    if (!entry) return undefined;
    if (now >= entry.expiresAt) {
      // WHY: lazy cleanup avoids timers and keeps the hot path cheap.
      this.cooldowns.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * Force a cooldown window for a target.
   *
   * Params:
   * - name: command name as registered in Seyfert.
   * - type: cooldown scope (user/guild/channel).
   * - target: id within the scope (userId/guildId/channelId).
   * - durationMs: length of the cooldown window in milliseconds.
   * - remaining: optional remaining uses within the window.
   *
   * Side effects: Overwrites any existing entry with a new expiration.
   * Errors: None (in-memory only).
   *
   * RISK: If `name` or `type` drift from the command registry, the penalty
   * will not match the command being enforced.
   */
  set(options: CooldownSetOptions): void {
    const key = this.buildKey(options.name, options.type, options.target);
    const now = this.now();
    const expiresAt = now + options.durationMs;
    const remaining = Math.max(0, Math.floor(options.remaining ?? 0));
    this.cooldowns.set(key, { expiresAt, remaining });
  }

  /**
   * Evaluate the cooldown for the given command context.
   *
   * Params:
   * - context: Seyfert context for the command invocation.
   * - use: optional key for per-subcommand limits.
   * - guildId: optional guild filter used for command lookup.
   *
   * Returns:
   * - true when the invocation is allowed.
   * - number (ms) when blocked with remaining time.
   *
   * Side effects: May create or update a cooldown entry.
   * Errors: None (in-memory only).
   */
  context(context: AnyContext, use?: keyof UsesProps, guildId?: string) {
    if (!("command" in context) || !("name" in context.command)) return true;
    if (!context.command.cooldown) return true;

    const target = this.resolveTarget(context, context.command.cooldown.type);
    return this.use({ name: context.command.name, target, use, guildId });
  }

  /**
   * Consume one use and return the cooldown state.
   *
   * Returns:
   * - true when allowed (and the usage was recorded).
   * - number (ms) when blocked, representing time until next allowed use.
   *
   * Side effects: Updates the in-memory cooldown entry.
   * Errors: None (in-memory only).
   */
  use(options: CooldownUseOptions): number | true {
    const cmd = this.getCommandData(options.name, options.guildId);
    if (!cmd) return true;

    const [name, data] = cmd;
    const key = this.buildKey(name, data.type, options.target);
    const now = this.now();
    const uses = this.getUses(data, options.use);

    const entry = this.readEntry(key, now);
    if (!entry) {
      const remaining = Math.max(uses - 1, 0);
      this.cooldowns.set(key, {
        expiresAt: now + data.interval,
        remaining,
      });
      return true;
    }

    if (entry.remaining > 0) {
      entry.remaining -= 1;
      this.cooldowns.set(key, entry);
      return true;
    }

    return Math.max(entry.expiresAt - now, 0);
  }
}

export interface CooldownProps {
  type: CooldownType;
  interval: number;
  uses: UsesProps;
}

export interface CooldownUseOptions {
  name: string;
  target: string;
  use?: keyof UsesProps;
  guildId?: string;
}

export interface CooldownSetOptions {
  name: string;
  target: string;
  type: CooldownType;
  durationMs: number;
  remaining?: number;
}

export interface UsesProps {
  default: number;
}

interface CooldownEntry {
  expiresAt: number;
  remaining: number;
}

declare module "seyfert" {
  interface Command {
    cooldown?: CooldownProps;
  }
  interface SubCommand {
    cooldown?: CooldownProps;
  }
  interface ContextMenuCommand {
    cooldown?: CooldownProps;
  }
  interface EntryPointCommand {
    cooldown?: CooldownProps;
  }
}
