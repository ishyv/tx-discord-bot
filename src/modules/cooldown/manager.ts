/**
 * Propósito: centralizar la contabilidad de cooldowns de comandos/listeners con
 * un modelo de “fichas” (tokens) por ventana temporal.
 * Encaje: capa de infraestructura para Seyfert; persiste en el cache del
 * gateway para que los límites se compartan entre shards/sesiones.
 * Invariantes: las claves siguen el formato `name:type:target`, `lastDrip`
 * marca la última operación (no el inicio de la ventana) y `remaining` nunca
 * debe ser negativa en almacenamiento. `uses.default` es el mínimo garantizado
 * y se usan aliases `use` para variaciones por subcomando.
 * Gotchas: `use` devuelve `number` cuando se rechaza (tiempo restante en ms);
 * los callers deben tratar cualquier valor numérico como “denegado”.
 */
import type { AnyContext, SubCommand, UsingClient } from "seyfert";
import { CacheFrom, type ReturnCache } from "seyfert/lib/cache";
import { fakePromise, type PickPartial } from "seyfert/lib/common";
import {
  type CooldownData,
  CooldownResource,
  type CooldownType,
} from "./resource";

/**
 * Administra recursos de cooldown en torno a comandos Seyfert.
 *
 * Invariantes operativos:
 * - `resource` guarda los cooldowns en el cache gateway (persistente por
 *   proceso) usando `namespace:cooldowns`.
 * - `buildKey` debe ser determinista; cambiarlo invalidaría todas las llaves
 *   previas.
 * - `resolveTarget` debe alinearse con el tipo configurado en el comando.
 * RISK: si `client.commands` no está cargado, `getCommandData` retorna
 * `undefined` y el cooldown no se aplica (modo degradado); monitorizar en
 * despliegues iniciales.
 */
export class CooldownManager {
  private readonly resource: CooldownResource;

  constructor(public readonly client: UsingClient) {
    this.resource = new CooldownResource(client.cache, client);
  }

  private buildKey(name: string, type: CooldownType, target: string) {
    return `${name}:${type}:${target}`;
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

  /**
   * Verifica si un target tiene cooldown activo sin consumir fichas.
   *
   * Propósito: chequeo previo (ej. middleware) antes de ejecutar la acción.
   * Retorna `true` si ya no quedan fichas disponibles o `false` si aún puede
   * usar el comando. Si no existe registro, lo inicializa con `allowed`.
   * RISK: si `tokens` supera `allowed`, se considera automáticamente bloqueado
   * para evitar underflow.
   */
  has(options: CooldownHasOptions): ReturnCache<boolean> {
    const cmd = this.getCommandData(options.name, options.guildId);
    if (!cmd) return false;

    const [name, data] = cmd;
    const tokens = options.tokens ?? 1;
    const allowed = data.uses[options.use ?? "default"];
    if (tokens > allowed) return true;

    return fakePromise(
      this.resource.get(this.buildKey(name, data.type, options.target)),
    ).then((cooldown) => {
      if (!cooldown) {
        return fakePromise(
          this.set({
            name,
            target: options.target,
            type: data.type,
            interval: data.interval,
            remaining: allowed,
          }),
        ).then(() => false);
      }

      const remaining = Math.max(cooldown.remaining - tokens, 0);
      return remaining === 0;
    });
  }

  set(options: CooldownSetOptions) {
    return this.resource.set(
      CacheFrom.Gateway,
      this.buildKey(options.name, options.type, options.target),
      {
        interval: options.interval,
        remaining: options.remaining,
        lastDrip: options.lastDrip,
      },
    );
  }

  /**
   * Versión contextual que lee `context.command.cooldown` y aplica `use`.
   *
   * Propósito: middleware para comandos Seyfert; si no hay metadata de
   * cooldown, deja pasar.
   * RISK: si el context no trae `guildId` o `channelId`, el target cae en el
   * usuario y las cuotas se comparten entre DM/guild.
   */
  context(context: AnyContext, use?: keyof UsesProps, guildId?: string) {
    if (!("command" in context) || !("name" in context.command)) return true;
    if (!context.command.cooldown) return true;

    const target = this.resolveTarget(context, context.command.cooldown.type);
    return this.use({ name: context.command.name, target, use, guildId });
  }

  /**
   * Consume fichas del cooldown y retorna `true` o milisegundos restantes.
   *
   * Propósito: registrar el uso real del comando. Si el target está en cooldown
   * devuelve el tiempo restante para reintentar.
   * RISK: callers deben tratar cualquier número como “deny”; no interpretar
   * `0` como éxito.
   */
  use(options: CooldownUseOptions): ReturnCache<number | true> {
    const cmd = this.getCommandData(options.name, options.guildId);
    if (!cmd) return true;

    const [name, data] = cmd;
    const key = this.buildKey(name, data.type, options.target);

    return fakePromise(this.resource.get(key)).then((cooldown) => {
      if (!cooldown) {
        return fakePromise(
          this.set({
            name,
            target: options.target,
            type: data.type,
            interval: data.interval,
            remaining: data.uses[options.use ?? "default"] - 1,
          }),
        ).then(() => true);
      }

      return fakePromise(
        this.drip({
          name,
          props: data,
          data: cooldown,
          target: options.target,
          use: options.use,
        }),
      ).then((drip) =>
        typeof drip === "number" ? data.interval - drip : true,
      );
    });
  }

  /**
   * Núcleo de consumo: decide si reinicia ventana o descuenta fichas.
   *
   * Retorna `true` cuando se consumió (o se reinició la ventana) y `number`
   * cuando no hay fichas suficientes (tiempo transcurrido desde `lastDrip`).
   * WHY: se compara `deltaMS` con `interval` para permitir “ventanas
   * deslizantes” simples sin cron; un reset reinicia `remaining` a `uses - 1`
   * (ya se consumió la actual).
   * RISK: si `remaining` en storage es negativo por corrupción, se puede
   * devolver un número inesperado; mantener validaciones en upstream.
   */
  drip(options: CooldownDripOptions): ReturnCache<boolean | number> {
    const now = Date.now();
    const deltaMS = now - options.data.lastDrip;

    const key = this.buildKey(options.name, options.props.type, options.target);
    const uses = options.props.uses[options.use ?? "default"];

    if (deltaMS >= options.props.interval) {
      return fakePromise(
        this.resource.patch(CacheFrom.Gateway, key, {
          lastDrip: now,
          remaining: uses - 1,
        }),
      ).then(() => true);
    }

    // RISK: si `remaining` ya está en 0, devolvemos delta para calcular cuánto
    // falta antes de reintentar; no se modifica `lastDrip` para no mover la
    // ventana.
    if (options.data.remaining - 1 < 0) return deltaMS;

    return fakePromise(
      this.resource.patch(CacheFrom.Gateway, key, {
        remaining: options.data.remaining - 1,
      }),
    ).then(() => true);
  }

  /**
   * Restaura las fichas a su valor inicial para un target.
   *
   * Propósito: comandos administrativos o flujos de perdón manual.
   * RISK: ignora `lastDrip`; usar con cuidado para no dejar ventanas
   * incoherentes respecto al tiempo transcurrido.
   */
  refill(name: string, target: string, use: keyof UsesProps = "default") {
    const cmd = this.getCommandData(name);
    if (!cmd) return false;

    const [resolve, data] = cmd;
    return fakePromise(
      this.resource.patch(
        CacheFrom.Gateway,
        this.buildKey(resolve, data.type, target),
        {
          remaining: data.uses[use],
        },
      ),
    ).then(() => true);
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

export interface CooldownDripOptions
  extends Omit<CooldownUseOptions, "guildId"> {
  props: CooldownProps;
  data: CooldownData;
}

export interface CooldownHasOptions extends CooldownUseOptions {
  tokens?: number;
}

export interface CooldownSetOptions
  extends PickPartial<CooldownData, "lastDrip"> {
  name: string;
  target: string;
  type: CooldownType;
}

export interface UsesProps {
  default: number;
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
