/**
 * Seyfert Adapter Unit Tests.
 *
 * Purpose: Test adapter helper functions for option parsing and context handling.
 */
import { describe, expect, it } from "bun:test";
import {
  parseStringOption,
  parseNumberOption,
  parseBooleanOption,
  parseUserOption,
  hasGuild,
} from "@/adapters/seyfert";

// Mock GuildCommandContext for testing
function createMockContext(options: Record<string, any> = {}): any {
  return {
    options,
    guildId: "test_guild_123",
    author: {
      id: "user_123",
      username: "TestUser",
      avatarURL: () => "https://example.com/avatar.png",
    },
  };
}

describe("Seyfert Adapter", () => {
  describe("parseStringOption", () => {
    it("should return string value when present", () => {
      const ctx = createMockContext({ name: "test_value" });
      const result = parseStringOption(ctx, "name");
      expect(result).toBe("test_value");
    });

    it("should return undefined when option is missing", () => {
      const ctx = createMockContext({});
      const result = parseStringOption(ctx, "name");
      expect(result).toBeUndefined();
    });

    it("should return undefined when option is not a string", () => {
      const ctx = createMockContext({ name: 123 });
      const result = parseStringOption(ctx, "name");
      expect(result).toBeUndefined();
    });
  });

  describe("parseNumberOption", () => {
    it("should return number value when present", () => {
      const ctx = createMockContext({ amount: 100 });
      const result = parseNumberOption(ctx, "amount");
      expect(result).toBe(100);
    });

    it("should return undefined when option is missing", () => {
      const ctx = createMockContext({});
      const result = parseNumberOption(ctx, "amount");
      expect(result).toBeUndefined();
    });

    it("should return undefined when option is not a number", () => {
      const ctx = createMockContext({ amount: "100" });
      const result = parseNumberOption(ctx, "amount");
      expect(result).toBeUndefined();
    });
  });

  describe("parseBooleanOption", () => {
    it("should return true when present", () => {
      const ctx = createMockContext({ enabled: true });
      const result = parseBooleanOption(ctx, "enabled");
      expect(result).toBe(true);
    });

    it("should return false when present", () => {
      const ctx = createMockContext({ enabled: false });
      const result = parseBooleanOption(ctx, "enabled");
      expect(result).toBe(false);
    });

    it("should return undefined when option is missing", () => {
      const ctx = createMockContext({});
      const result = parseBooleanOption(ctx, "enabled");
      expect(result).toBeUndefined();
    });

    it("should return undefined when option is not a boolean", () => {
      const ctx = createMockContext({ enabled: "true" });
      const result = parseBooleanOption(ctx, "enabled");
      expect(result).toBeUndefined();
    });
  });

  describe("parseUserOption", () => {
    it("should return user info when present", () => {
      const ctx = createMockContext({
        target: { id: "user_456", username: "TargetUser" },
      });
      const result = parseUserOption(ctx, "target");
      expect(result).toEqual({ id: "user_456", username: "TargetUser" });
    });

    it("should return undefined when option is missing", () => {
      const ctx = createMockContext({});
      const result = parseUserOption(ctx, "target");
      expect(result).toBeUndefined();
    });

    it("should return undefined when option is not an object", () => {
      const ctx = createMockContext({ target: "user_456" });
      const result = parseUserOption(ctx, "target");
      expect(result).toBeUndefined();
    });

    it("should handle user object with name instead of username", () => {
      const ctx = createMockContext({
        target: { id: "user_789", name: "NamedUser" },
      });
      const result = parseUserOption(ctx, "target");
      expect(result).toEqual({ id: "user_789", username: "NamedUser" });
    });
  });

  describe("hasGuild", () => {
    it("should return true when guildId is present", () => {
      const ctx = createMockContext();
      expect(hasGuild(ctx)).toBe(true);
    });

    it("should return false when guildId is null", () => {
      const ctx = { ...createMockContext(), guildId: null };
      expect(hasGuild(ctx)).toBe(false);
    });

    it("should return false when guildId is undefined", () => {
      const ctx = { ...createMockContext(), guildId: undefined };
      expect(hasGuild(ctx)).toBe(false);
    });

    it("should return false when guildId is empty string", () => {
      const ctx = { ...createMockContext(), guildId: "" };
      expect(hasGuild(ctx)).toBe(false);
    });
  });
});
