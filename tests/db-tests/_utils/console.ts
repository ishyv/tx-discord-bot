export const withConsoleMuted = async <T>(
  types: Array<"log" | "warn" | "error">,
  fn: () => Promise<T>,
): Promise<T> => {
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  const noop = () => undefined;
  for (const type of types) {
    console[type] = noop as typeof console.log;
  }

  try {
    return await fn();
  } finally {
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
  }
};
