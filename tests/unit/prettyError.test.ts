/**
 * Unit Tests: Pretty Discord Error Parser
 *
 * Purpose: Verify error path parsing and context resolution.
 */

import { describe, it, expect } from "bun:test";
import {
	parseDiscordError,
	resolveErrorContext,
	prettyPrintDiscord50035,
	type ParsedError,
} from "@/dev/prettyCommandRegistrationError";

describe("parseDiscordError", () => {
	describe("valid error formats", () => {
		it("parses simple indexed path", () => {
			const error = "1.options.0.name [APPLICATION_COMMAND_INVALID_NAME]: Invalid name";
			const result = parseDiscordError(error);
			expect(result).not.toBeNull();
			expect(result?.path).toBe("1.options.0.name");
			expect(result?.code).toBe("APPLICATION_COMMAND_INVALID_NAME");
			expect(result?.message).toContain("Invalid name");
		});

		it("parses deep nested path", () => {
			const error = "40.options.2.options.1.name [APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID]";
			const result = parseDiscordError(error);
			expect(result).not.toBeNull();
			expect(result?.path).toBe("40.options.2.options.1.name");
			expect(result?.code).toBe("APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID");
		});

		it("parses error without trailing message", () => {
			const error = "5.name [APPLICATION_COMMAND_INVALID_NAME]";
			const result = parseDiscordError(error);
			expect(result).not.toBeNull();
			expect(result?.path).toBe("5.name");
			expect(result?.code).toBe("APPLICATION_COMMAND_INVALID_NAME");
		});

		it("parses error with spaces", () => {
			const error = "0.options.0.description [BASE_TYPE_BAD_LENGTH] : Must be between 1 and 100";
			const result = parseDiscordError(error);
			expect(result).not.toBeNull();
			expect(result?.path).toBe("0.options.0.description");
			expect(result?.code).toBe("BASE_TYPE_BAD_LENGTH");
		});
	});

	describe("invalid error formats", () => {
		it("returns null for completely invalid string", () => {
			const error = "This is not a valid error";
			const result = parseDiscordError(error);
			expect(result).toBeNull();
		});

		it("returns null for empty string", () => {
			const result = parseDiscordError("");
			expect(result).toBeNull();
		});
	});
});

describe("resolveErrorContext", () => {
	const mockCommands = [
		{
			name: "ping",
			description: "Ping command",
			options: {
				count: {
					name: "count",
					description: "Number of pings",
					required: true,
				},
			},
		},
		{
			name: "economy",
			description: "Economy commands",
			options: {
				freeze: {
					name: "freeze",
					description: "Freeze user",
					options: {
						user: {
							name: "user",
							description: "User to freeze",
							required: true,
						},
					},
				},
			},
		},
	];

	describe("top-level commands", () => {
		it("resolves first command", () => {
			const context = resolveErrorContext("0.name", mockCommands);
			expect(context).not.toBeNull();
			expect(context?.commandName).toBe("ping");
		});

		it("resolves second command", () => {
			const context = resolveErrorContext("1.name", mockCommands);
			expect(context).not.toBeNull();
			expect(context?.commandName).toBe("economy");
		});

		it("returns null for out of bounds index", () => {
			const context = resolveErrorContext("99.name", mockCommands);
			expect(context).toBeNull();
		});

		it("returns null for negative index", () => {
			const context = resolveErrorContext("-1.name", mockCommands);
			expect(context).toBeNull();
		});
	});

	describe("options traversal", () => {
		it("resolves first-level option", () => {
			const context = resolveErrorContext("0.options.count.name", mockCommands);
			expect(context).not.toBeNull();
			expect(context?.commandName).toBe("ping");
			expect(context?.optionChain).toContain("count");
		});

		it("resolves nested subcommand option", () => {
			const context = resolveErrorContext("1.options.freeze.options.user.name", mockCommands);
			expect(context).not.toBeNull();
			expect(context?.commandName).toBe("economy");
			expect(context?.optionChain).toContain("freeze");
			expect(context?.optionChain).toContain("user");
		});
	});

	describe("parent snippet", () => {
		it("includes parent object in context", () => {
			const context = resolveErrorContext("0.options.count", mockCommands);
			expect(context).not.toBeNull();
			expect(context?.parentSnippet).toBeDefined();
		});
	});
});

describe("prettyPrintDiscord50035", () => {
	const mockCommands = [
		{
			name: "test-cmd",
			description: "Test command",
			options: {
				"preset:soft": {
					name: "preset:soft",
					description: "Soft preset option",
					required: true,
				},
			},
		},
	];

	it("includes error code explanation", () => {
		const error = new Error("0.options.0.name [APPLICATION_COMMAND_INVALID_NAME]: Invalid character");
		const output = prettyPrintDiscord50035(error, mockCommands);
		expect(output).toContain("APPLICATION_COMMAND_INVALID_NAME");
		expect(output).toContain("invalid characters");
	});

	it("includes command path", () => {
		const error = new Error("0.name [APPLICATION_COMMAND_INVALID_NAME]");
		const output = prettyPrintDiscord50035(error, mockCommands);
		expect(output).toContain("test-cmd");
	});

	it("includes fix suggestions for name errors", () => {
		const error = new Error("0.options.0.name [APPLICATION_COMMAND_INVALID_NAME]");
		const output = prettyPrintDiscord50035(error, mockCommands);
		expect(output).toContain("lowercase");
		expect(output).toContain("Remove");
	});

	it("includes fix suggestions for required order errors", () => {
		const error = new Error("0.options.1 [APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID]");
		const output = prettyPrintDiscord50035(error, mockCommands);
		expect(output).toContain("required");
		expect(output).toContain("optional");
	});

	it("handles unparseable errors gracefully", () => {
		const error = new Error("Some random error without structure");
		const output = prettyPrintDiscord50035(error, mockCommands);
		expect(output).toContain("Could not parse");
	});

	it("handles errors with no context resolution", () => {
		const error = new Error("99.name [APPLICATION_COMMAND_INVALID_NAME]");
		const output = prettyPrintDiscord50035(error, mockCommands);
		expect(output).toContain("Could not resolve");
	});

	it("includes JSON snippet of parent object", () => {
		const error = new Error("0.name [APPLICATION_COMMAND_INVALID_NAME]");
		const output = prettyPrintDiscord50035(error, mockCommands);
		expect(output).toContain("```json");
		expect(output).toContain("test-cmd");
	});
});
