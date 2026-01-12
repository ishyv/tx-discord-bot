import { Currency, CurrencyId } from "./currency";

type CurrencyCtor = new () => Currency<unknown>;
/**
 * In-memory registry for currency singletons used by the economy module.
 * Holds one instance per CurrencyId for fast lookup and decorator-based auto-registration.
 */
export class CurrencyRegistry {
  private readonly currencies = new Map<CurrencyId, Currency<unknown>>();

  constructor(initial: Currency<unknown>[] = []) {
    for (const currency of initial) {
      this.register(currency);
    }
  }

  register(currency: Currency<unknown>): void {
    if (this.currencies.has(currency.id)) {
      console.warn(`Currency already registered: ${currency.id}. Ignoring duplicate registration.`);
      return;
    }
    this.currencies.set(currency.id, currency);
  }

  get(id: CurrencyId): Currency<unknown> | null {
    return this.currencies.get(id) ?? null;
  }

  // Get all registered currency IDs.
  list(): string[] {
    return Array.from(this.currencies.keys());
  }
}

export const currencyRegistry = new CurrencyRegistry();

export function registerCurrency(currency: Currency<unknown>): void {
  currencyRegistry.register(currency);
}

/** Decorate a currency class to auto-register it in the shared registry. */
export function Register(): ClassDecorator {
  return (target) => {
    const ctor = target as unknown as CurrencyCtor;
    registerCurrency(new ctor());
  };
}
