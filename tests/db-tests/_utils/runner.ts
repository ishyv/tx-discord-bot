import { AssertionError, stableStringify } from "./assert";
import { CleanupTracker } from "./cleanup";
import { createFakeFactory, type FakeFactory } from "./fake";

export const ops = {
  create: "create",
  read: "read",
  update: "update",
  delete: "delete",
  find: "find",
  list: "list",
  upsert: "upsert",
  cache: "cache",
  service: "service",
  other: "other",
} as const;

export type Operation = (typeof ops)[keyof typeof ops];

export type TestContext = {
  factory: FakeFactory;
  cleanup: CleanupTracker;
};

export type TestCase = {
  name: string;
  ops?: Operation[];
  run: (ctx: TestContext) => Promise<void>;
};

export type SuiteContext = {
  factory: FakeFactory;
};

export type Suite = {
  name: string;
  tests: TestCase[];
  setup?: (ctx: SuiteContext) => Promise<void> | void;
  teardown?: (ctx: SuiteContext) => Promise<void> | void;
};

export type SuiteResult = {
  name: string;
  passed: number;
  failed: number;
  durationMs: number;
  ops: Set<Operation>;
  failures: Array<{ test: string; error: unknown }>;
};

const color = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const paint = (code: string, value: string): string =>
  `${code}${value}${color.reset}`;

const formatDuration = (ms: number): string => `${ms}ms`;

const formatOpsChecklist = (tested: Set<Operation>): string => {
  const items: Array<{ key: Operation; label: string }> = [
    { key: ops.create, label: "Create" },
    { key: ops.read, label: "Read" },
    { key: ops.update, label: "Update" },
    { key: ops.delete, label: "Delete" },
    { key: ops.find, label: "Find" },
    { key: ops.list, label: "List" },
    { key: ops.upsert, label: "Upsert" },
  ];

  return items
    .map(({ key, label }) => {
      const has = tested.has(key);
      const mark = has ? paint(color.green, "Y") : paint(color.gray, "-");
      return `${label}:${mark}`;
    })
    .join(" ");
};

const formatErrorDetails = (error: unknown): string[] => {
  if (error instanceof AssertionError) {
    const lines = [paint(color.red, `AssertionError: ${error.message}`)];
    if (error.expected !== undefined || error.actual !== undefined) {
      if (error.expected !== undefined) {
        lines.push(`expected: ${stableStringify(error.expected)}`);
      }
      if (error.actual !== undefined) {
        lines.push(`actual: ${stableStringify(error.actual)}`);
      }
    }
    return lines;
  }

  if (error instanceof Error) {
    return [paint(color.red, `${error.name}: ${error.message}`)];
  }

  return [paint(color.red, `Error: ${String(error)}`)];
};

export const runSuite = async (suite: Suite): Promise<SuiteResult> => {
  const suiteStart = Date.now();
  const factory = createFakeFactory(suite.name);
  const ctx: SuiteContext = { factory };

  const result: SuiteResult = {
    name: suite.name,
    passed: 0,
    failed: 0,
    durationMs: 0,
    ops: new Set<Operation>(),
    failures: [],
  };

  console.log(paint(color.bold + color.cyan, `== ${suite.name} ==`));

  if (suite.setup) {
    await suite.setup(ctx);
  }

  for (const test of suite.tests) {
    const testStart = Date.now();
    const cleanup = new CleanupTracker();
    const testCtx: TestContext = { factory, cleanup };

    if (test.ops) {
      for (const op of test.ops) {
        result.ops.add(op);
      }
    }

    try {
      await test.run(testCtx);
      await cleanup.run();
      result.passed += 1;
      const duration = Date.now() - testStart;
      console.log(
        `${paint(color.green, "PASS")} ${test.name} (${formatDuration(duration)})`,
      );
    } catch (error) {
      await cleanup.run();
      result.failed += 1;
      const duration = Date.now() - testStart;
      console.log(
        `${paint(color.red, "FAIL")} ${test.name} (${formatDuration(duration)})`,
      );
      for (const line of formatErrorDetails(error)) {
        console.log(`  ${line}`);
      }
      result.failures.push({ test: test.name, error });
    }
  }

  if (suite.teardown) {
    await suite.teardown(ctx);
  }

  result.durationMs = Date.now() - suiteStart;

  console.log(`Ops: ${formatOpsChecklist(result.ops)}`);
  const summary = `${result.passed}/${result.passed + result.failed} passed`;
  const summaryColor = result.failed ? color.red : color.green;
  console.log(
    paint(summaryColor, `Summary: ${summary}`) +
      ` | ${formatDuration(result.durationMs)}`,
  );
  console.log("");

  return result;
};

export const runSuites = async (suites: Suite[]): Promise<SuiteResult[]> => {
  const results: SuiteResult[] = [];
  for (const suite of suites) {
    results.push(await runSuite(suite));
  }
  return results;
};

export const printGlobalSummary = (results: SuiteResult[]): void => {
  const total = results.reduce((acc, r) => acc + r.passed + r.failed, 0);
  const passed = results.reduce((acc, r) => acc + r.passed, 0);
  const failed = results.reduce((acc, r) => acc + r.failed, 0);
  const duration = results.reduce((acc, r) => acc + r.durationMs, 0);

  const status =
    failed === 0 ? paint(color.green, "PASS") : paint(color.red, "FAIL");
  console.log(paint(color.bold + color.cyan, "== DB Test Summary =="));
  console.log(
    `${status} ${passed}/${total} passed | ${formatDuration(duration)}`,
  );
};
