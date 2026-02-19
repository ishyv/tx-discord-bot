import { Currency } from "@/modules/economy/currency";
import { Register } from "../currencyRegistry";

const normalizeRep = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
};

declare module "@/modules/economy/currency" {
  interface CurrencyValueMap {
    rep: number;
  }
}

@Register()
export class Reputation implements Currency<number> {
  readonly id = "rep";

  zero(): number {
    return 0;
  }

  display(value: number): string {
    const normalized = Math.max(0, normalizeRep(value));
    return `${normalized} rep`;
  }

  displayAmount(value: number): string {
    return `${Math.max(0, Math.trunc(value))} rep`;
  }

  toValue(amount: number): number {
    return Math.max(0, Math.trunc(amount));
  }

  toAmount(value: number): number {
    return Math.max(0, normalizeRep(value));
  }

  add(a: number, b: number): number {
    const next = normalizeRep(a) + normalizeRep(b);
    return Math.max(0, next);
  }

  sub(a: number, b: number): number {
    const next = normalizeRep(a) - normalizeRep(b);
    return Math.max(0, next);
  }

  isValid(value: number): boolean {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Math.trunc(value) >= 0
    );
  }
}
