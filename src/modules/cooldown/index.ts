/**
 * In-memory cooldown entrypoint.
 */
import type { CooldownProps } from "./manager";

export * from "./manager";

export function Cooldown(props: CooldownProps) {
  return <T extends new (...args: any[]) => {}>(target: T) =>
    class extends target {
      cooldown = props;
    };
}
