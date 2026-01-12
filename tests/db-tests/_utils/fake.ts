import { getNamespace, getSeed } from "./env";

type Rng = () => number;

const WORDS = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
  "tango",
  "uniform",
  "victor",
  "whiskey",
  "xray",
  "yankee",
  "zulu",
];

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): Rng => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

export type FakeFactory = {
  namespace: string;
  suite: string;
  rng: Rng;
  nextId: (prefix: string) => string;
  snowflake: () => string;
  int: (min: number, max: number) => number;
  bool: () => boolean;
  pick: <T>(items: T[]) => T;
  word: () => string;
  sentence: (words?: number) => string;
  email: () => string;
  date: () => Date;
  isoDate: () => string;
  userId: () => string;
  guildId: () => string;
  roleId: () => string;
  channelId: () => string;
  messageId: () => string;
  offerId: () => string;
  warnId: () => string;
  emojiKey: () => string;
};

export const createFakeFactory = (suiteName: string): FakeFactory => {
  const seed = getSeed();
  const namespace = getNamespace();
  const suite = slugify(suiteName) || "suite";
  const rng = mulberry32(hashString(`${seed}:${suite}`));
  let counter = 0;

  const nextId = (prefix: string) => {
    counter += 1;
    return `${prefix}-${suite}-${namespace}-${counter}`;
  };

  const snowflake = () => {
    let digits = "";
    for (let i = 0; i < 18; i += 1) {
      const next = int(0, 9);
      if (i === 0 && next === 0) {
        digits += "1";
      } else {
        digits += String(next);
      }
    }
    return digits;
  };

  const int = (min: number, max: number) => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(rng() * (hi - lo + 1)) + lo;
  };

  const bool = () => rng() >= 0.5;

  const pick = <T>(items: T[]): T => {
    return items[int(0, Math.max(items.length - 1, 0))];
  };

  const word = () => pick(WORDS);

  const sentence = (count = 6) => {
    const words = Array.from({ length: count }, () => word());
    return words.join(" ");
  };

  const email = () => `${word()}-${int(1, 999)}@example.test`;

  const date = () => {
    const base = new Date("2023-01-01T00:00:00.000Z");
    const days = int(0, 365);
    const hours = int(0, 23);
    const minutes = int(0, 59);
    base.setUTCDate(base.getUTCDate() + days);
    base.setUTCHours(hours, minutes, 0, 0);
    return base;
  };

  const isoDate = () => date().toISOString();

  return {
    namespace,
    suite,
    rng,
    nextId,
    snowflake,
    int,
    bool,
    pick,
    word,
    sentence,
    email,
    date,
    isoDate,
    userId: () => nextId("user"),
    guildId: () => nextId("guild"),
    roleId: () => nextId("role"),
    channelId: () => nextId("channel"),
    messageId: () => nextId("message"),
    offerId: () => nextId("offer"),
    warnId: () => nextId("warn"),
    emojiKey: () => nextId("emoji"),
  };
};
