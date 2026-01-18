import { performance } from "node:perf_hooks";
import type { AnyContext, SubCommand, UsingClient } from "seyfert";

export enum CooldownType {
  User = "user",
  Guild = "guild",
  Channel = "channel",
}

export class CooldownManager {
  private readonly cooldowns = new Map<string, CooldownEntry>();

  constructor(public readonly client: UsingClient) {}

  private buildKey(name: string, type: CooldownType, target: string) {
    return `${name}:${type}:${target}`;
  }

  private now(): number {
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
      this.cooldowns.delete(key);
      return undefined;
    }
    return entry;
  }

  set(options: CooldownSetOptions): void {
    const key = this.buildKey(options.name, options.type, options.target);
    const now = this.now();
    const expiresAt = now + options.durationMs;
    const remaining = Math.max(0, Math.floor(options.remaining ?? 0));
    this.cooldowns.set(key, { expiresAt, remaining });
  }

  context(context: AnyContext, use?: keyof UsesProps, guildId?: string) {
    if (!("command" in context) || !("name" in context.command)) return true;
    if (!context.command.cooldown) return true;

    const target = this.resolveTarget(context, context.command.cooldown.type);
    return this.use({ name: context.command.name, target, use, guildId });
  }

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
