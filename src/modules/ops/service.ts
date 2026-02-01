/**
 * Launch Ops Service.
 *
 * Purpose: Main entry point for launch operations - ties together assertions, config, and scheduling.
 * Context: Initialized at bot startup to ensure safe operation.
 */

import { ErrResult, OkResult, type Result } from "@/utils/result";
import { opsConfigRepo } from "./repository";
import { startupAssertions } from "./startup-assertions";
import { scheduledReporting, startScheduledReporting } from "./scheduled-reports";
import type {
  GuildOpsConfig,
  UpdateOpsConfigInput,
  OpsHealthStatus,
  AssertionResult,
  KillSwitch,
} from "./types";
import type { GuildId } from "@/db/types";

/** Service interface for launch operations. */
export interface LaunchOpsService {
  /** Initialize the launch ops system (call at bot startup). */
  initialize(): Promise<InitializationResult>;

  /** Get ops config for a guild. */
  getConfig(guildId: GuildId): Promise<Result<GuildOpsConfig, Error>>;

  /** Update ops config for a guild. */
  updateConfig(guildId: GuildId, input: UpdateOpsConfigInput): Promise<Result<GuildOpsConfig, Error>>;

  /** Get current health status. */
  getHealth(): Promise<OpsHealthStatus>;

  /** Get kill switch status. */
  getKillSwitches(): Promise<KillSwitch[]>;

  /** Run manual startup assertions. */
  runAssertions(): Promise<{ passed: AssertionResult[]; failed: AssertionResult[] }>;

  /** Manually trigger a scheduled report. */
  triggerReport(guildId: GuildId): Promise<Result<string, Error>>;
}

/** Result of initialization. */
export interface InitializationResult {
  readonly success: boolean;
  readonly assertions: {
    passed: AssertionResult[];
    failed: AssertionResult[];
    overall: "passed" | "failed" | "degraded";
  };
  readonly schedulingStarted: boolean;
  readonly error?: string;
}

class LaunchOpsServiceImpl implements LaunchOpsService {

  async initialize(): Promise<InitializationResult> {
    console.log("[LaunchOps] Initializing launch operations...");

    try {
      // Run startup assertions
      const assertionResult = await startupAssertions.runAssertions();

      if (assertionResult.overall === "failed") {
        console.error("[LaunchOps] CRITICAL: Startup assertions failed!");
        return {
          success: false,
          assertions: assertionResult,
          schedulingStarted: false,
          error: "Critical startup assertions failed. Check logs for details.",
        };
      }

      if (assertionResult.overall === "degraded") {
        console.warn("[LaunchOps] WARNING: Some startup assertions failed (non-critical)");
      }

      // Start scheduled reporting
      startScheduledReporting();

      console.log("[LaunchOps] Launch operations initialized successfully");

      return {
        success: true,
        assertions: assertionResult,
        schedulingStarted: true,
      };
    } catch (error) {
      console.error("[LaunchOps] Failed to initialize:", error);
      return {
        success: false,
        assertions: { passed: [], failed: [], overall: "failed" },
        schedulingStarted: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getConfig(guildId: GuildId): Promise<Result<GuildOpsConfig, Error>> {
    return opsConfigRepo.get(guildId);
  }

  async updateConfig(
    guildId: GuildId,
    input: UpdateOpsConfigInput,
  ): Promise<Result<GuildOpsConfig, Error>> {
    return opsConfigRepo.update(guildId, input);
  }

  async getHealth(): Promise<OpsHealthStatus> {
    return startupAssertions.getHealthStatus();
  }

  async getKillSwitches(): Promise<KillSwitch[]> {
    return startupAssertions.getKillSwitches();
  }

  async runAssertions(): Promise<{ passed: AssertionResult[]; failed: AssertionResult[] }> {
    const result = await startupAssertions.runAssertions();
    return {
      passed: result.passed,
      failed: result.failed,
    };
  }

  async triggerReport(guildId: GuildId): Promise<Result<string, Error>> {
    try {
      const result = await scheduledReporting.runReport(guildId);

      if (result.isErr()) {
        return ErrResult(result.error);
      }

      const output = result.unwrap();
      return OkResult(
        `Report generated for ${output.quickStats.days} days. ` +
          `Net inflation: ${output.quickStats.netInflation.toLocaleString()}. ` +
          `Flags: ${Object.entries(output.flags)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(", ") || "none"}`,
      );
    } catch (error) {
      return ErrResult(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Singleton instance. */
export const launchOps: LaunchOpsService = new LaunchOpsServiceImpl();
