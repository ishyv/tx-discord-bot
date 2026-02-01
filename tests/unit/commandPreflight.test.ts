/**
 * Unit Tests: Command Preflight Validation
 *
 * Purpose: Verify preflight validation catches invalid command definitions.
 */

import { describe, it, expect } from "bun:test";
import {
	validateCommandPayload,
	printIssues,
	hasCriticalIssues,
	type ValidationIssue,
} from "@/dev/commandPreflight";

describe("validateCommandPayload", () => {
	describe("command name validation", () => {
		it("accepts valid lowercase names", () => {
			const commands = [{ name: "ping", description: "Ping command" }];
			const issues = validateCommandPayload(commands);
			expect(issues).toHaveLength(0);
		});

		it("accepts names with hyphens", () => {
			const commands = [{ name: "economy-freeze", description: "Freeze command" }];
			const issues = validateCommandPayload(commands);
			expect(issues).toHaveLength(0);
		});

		it("accepts names with underscores", () => {
			const commands = [{ name: "economy_freeze", description: "Freeze command" }];
			const issues = validateCommandPayload(commands);
			expect(issues).toHaveLength(0);
		});

		it("rejects uppercase letters", () => {
			const commands = [{ name: "Ping", description: "Ping command" }];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0].message).toContain("uppercase");
		});

		it("rejects names with spaces", () => {
			const commands = [{ name: "ping test", description: "Ping command" }];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0].message).toContain("invalid characters");
		});

		it("rejects names with colons", () => {
			const commands = [{ name: "preset:soft", description: "Preset command" }];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0].message).toContain("invalid characters");
			expect(issues[0].fixHint).toContain(":");
		});

		it("rejects names with dots", () => {
			const commands = [{ name: "config.json", description: "Config command" }];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0].message).toContain("invalid characters");
		});

		it("rejects empty names", () => {
			const commands = [{ name: "", description: "Empty name command" }];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0].message).toContain("missing");
		});

		it("rejects names over 32 characters", () => {
			const commands = [{ name: "a".repeat(33), description: "Long name command" }];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0].message).toContain("length");
		});
	});

	describe("description validation", () => {
		it("accepts valid descriptions", () => {
			const commands = [{ name: "ping", description: "A valid description" }];
			const issues = validateCommandPayload(commands);
			expect(issues).toHaveLength(0);
		});

		it("rejects missing descriptions", () => {
			const commands = [{ name: "ping" }];
			const issues = validateCommandPayload(commands);
			const descIssues = issues.filter((i) => i.field === "description");
			expect(descIssues.length).toBeGreaterThan(0);
			expect(descIssues[0].message).toContain("missing");
		});

		it("rejects empty descriptions", () => {
			const commands = [{ name: "ping", description: "" }];
			const issues = validateCommandPayload(commands);
			const descIssues = issues.filter((i) => i.field === "description");
			expect(descIssues.length).toBeGreaterThan(0);
			expect(descIssues[0].message).toContain("missing");
		});

		it("rejects descriptions over 100 characters", () => {
			const commands = [{ name: "ping", description: "a".repeat(101) }];
			const issues = validateCommandPayload(commands);
			const descIssues = issues.filter((i) => i.field === "description");
			expect(descIssues.length).toBeGreaterThan(0);
			expect(descIssues[0].message).toContain("length");
		});
	});

	describe("option validation", () => {
		it("accepts valid options", () => {
			const commands = [{
				name: "test",
				description: "Test command",
				options: {
					user: {
						name: "user",
						description: "User to target",
						required: true,
					},
				},
			}];
			const issues = validateCommandPayload(commands);
			expect(issues).toHaveLength(0);
		});

		it("rejects options with missing descriptions", () => {
			const commands = [{
				name: "test",
				description: "Test command",
				options: {
					user: {
						name: "user",
						required: true,
					},
				},
			}];
			const issues = validateCommandPayload(commands);
			// Look for any issue related to missing description on the user option
			const optIssues = issues.filter((i) => 
				i.message.includes("description") && i.message.includes("user")
			);
			expect(optIssues.length).toBeGreaterThan(0);
		});

		it("rejects option names with invalid characters", () => {
			const commands = [{
				name: "test",
				description: "Test command",
				options: {
					"preset:soft": {
						name: "preset:soft",
						description: "Preset option",
						required: true,
					},
				},
			}];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues.some((i) => i.message.includes("invalid characters"))).toBe(true);
		});
	});

	describe("required option ordering", () => {
		it("accepts required options before optional", () => {
			const commands = [{
				name: "test",
				description: "Test command",
				options: {
					user: {
						name: "user",
						description: "User to target",
						required: true,
					},
					reason: {
						name: "reason",
						description: "Optional reason",
						required: false,
					},
				},
			}];
			const issues = validateCommandPayload(commands);
			const orderIssues = issues.filter((i) => i.message.includes("after optional"));
			expect(orderIssues).toHaveLength(0);
		});

		it("rejects required option after optional", () => {
			const commands = [{
				name: "test",
				description: "Test command",
				options: {
					optional: {
						name: "optional",
						description: "Optional first",
						required: false,
					},
					required: {
						name: "required",
						description: "Required after",
						required: true,
					},
				},
			}];
			const issues = validateCommandPayload(commands);
			const orderIssues = issues.filter((i) => i.message.includes("after optional"));
			expect(orderIssues.length).toBeGreaterThan(0);
			expect(orderIssues[0].message).toContain("required");
		});
	});

	describe("multiple commands", () => {
		it("validates all commands in array", () => {
			const commands = [
				{ name: "valid", description: "Valid command" },
				{ name: "Invalid", description: "Invalid name" },
				{ name: "also:invalid", description: "Another invalid" },
			];
			const issues = validateCommandPayload(commands);
			expect(issues.length).toBeGreaterThanOrEqual(2);
		});

		it("reports correct paths for each command", () => {
			const commands = [
				{ name: "valid", description: "Valid command" },
				{ name: "Invalid", description: "Invalid name" },
			];
			const issues = validateCommandPayload(commands);
			const invalidIssues = issues.filter((i) => i.commandName === "Invalid");
			expect(invalidIssues.length).toBeGreaterThan(0);
			expect(invalidIssues[0].path).toContain("1"); // Second command
		});

		it("detects duplicate command names", () => {
			const commands = [
				{ name: "ping", description: "First ping command" },
				{ name: "pong", description: "Pong command" },
				{ name: "ping", description: "Second ping command - duplicate!" },
			];
			const issues = validateCommandPayload(commands);
			const dupIssues = issues.filter((i) => i.message.includes("Duplicate"));
			expect(dupIssues.length).toBeGreaterThan(0);
			expect(dupIssues[0].message).toContain("ping");
			expect(dupIssues[0].path).toContain("0");
			expect(dupIssues[0].path).toContain("2");
		});
	});
});

describe("printIssues", () => {
	it("returns success message for empty issues", () => {
		const output = printIssues([], []);
		expect(output).toContain("No validation issues");
	});

	it("formats issues with all details", () => {
		const issues: ValidationIssue[] = [{
			path: "1.name",
			commandName: "test",
			field: "name",
			value: "invalid:name",
			message: "Name contains invalid characters",
			fixHint: "Remove colons",
		}];
		const output = printIssues(issues, [{ name: "valid" }]);
		expect(output).toContain("Issue #1");
		expect(output).toContain("test");
		expect(output).toContain("invalid");
		expect(output).toContain("Remove colons");
	});

	it("returns success for no issues", () => {
		const commands = [{ name: "test" }, { name: "test2" }];
		const output = printIssues([], commands);
		expect(output).toContain("No validation issues");
	});
});

describe("hasCriticalIssues", () => {
	it("returns false for empty issues", () => {
		expect(hasCriticalIssues([])).toBe(false);
	});

	it("returns true for any issues", () => {
		const issues: ValidationIssue[] = [{
			path: "0.name",
			commandName: "test",
			field: "name",
			value: "bad",
			message: "Bad name",
			fixHint: "Fix it",
		}];
		expect(hasCriticalIssues(issues)).toBe(true);
	});
});
