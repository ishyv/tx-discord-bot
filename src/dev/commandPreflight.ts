/**
 * Command Preflight Validation
 *
 * Purpose: Catch Discord command validation errors before API call.
 * Context: Runs during bootstrap to validate command payloads.
 * Dependencies: None (pure validation logic).
 */

// Note: This module intentionally avoids importing Seyfert types directly
// to remain agnostic of the specific command implementation.

export interface ValidationIssue {
	path: string;
	commandName: string;
	field: string;
	value: unknown;
	message: string;
	fixHint: string;
}

interface CommandLike {
	name?: string;
	description?: string;
	options?: Record<string, OptionLike>;
}

interface OptionLike {
	name?: string;
	description?: string;
	required?: boolean;
	options?: Record<string, OptionLike>;
}

// Discord's strict name regex: letters, numbers, underscores, hyphens only
const DISCORD_NAME_REGEX = /^[\w-]{1,32}$/;
// More permissive regex for choice values (can contain colons, spaces, etc)
const INVALID_NAME_CHARS = /[^a-z0-9_-]/;

function validateName(
	name: string,
	context: string,
	path: string,
	commandName: string,
): ValidationIssue | null {
	if (!name) {
		return {
			path,
			commandName,
			field: "name",
			value: name,
			message: `${context} name is missing`,
			fixHint: "Add a name field with 1-32 characters",
		};
	}

	if (typeof name !== "string") {
		return {
			path,
			commandName,
			field: "name",
			value: name,
			message: `${context} name must be a string`,
			fixHint: "Ensure name is a string literal",
		};
	}

	if (name.length < 1 || name.length > 32) {
		return {
			path,
			commandName,
			field: "name",
			value: name,
			message: `${context} name "${name}" length is ${name.length}, must be 1-32 characters`,
			fixHint: "Shorten the name to 32 characters or less",
		};
	}

	if (name !== name.toLowerCase()) {
		return {
			path,
			commandName,
			field: "name",
			value: name,
			message: `${context} name "${name}" contains uppercase letters`,
			fixHint: "Convert to lowercase: " + name.toLowerCase(),
		};
	}

	if (INVALID_NAME_CHARS.test(name)) {
		const invalidChars = name.split("").filter((c) => INVALID_NAME_CHARS.test(c));
		return {
			path,
			commandName,
			field: "name",
			value: name,
			message: `${context} name "${name}" contains invalid characters: [${invalidChars.join(", ")}]`,
			fixHint: `Remove invalid characters. Only a-z, 0-9, _, - allowed. Invalid: [${invalidChars.join(", ")}]`,
		};
	}

	if (!DISCORD_NAME_REGEX.test(name)) {
		return {
			path,
			commandName,
			field: "name",
			value: name,
			message: `${context} name "${name}" does not match Discord's regex`,
			fixHint: "Use only lowercase letters, numbers, underscores, hyphens",
		};
	}

	return null;
}

function validateDescription(
	description: string | undefined,
	context: string,
	path: string,
	commandName: string,
): ValidationIssue | null {
	if (!description) {
		return {
			path,
			commandName,
			field: "description",
			value: description,
			message: `${context} description is missing`,
			fixHint: "Add a description field (1-100 characters)",
		};
	}

	if (typeof description !== "string") {
		return {
			path,
			commandName,
			field: "description",
			value: description,
			message: `${context} description must be a string`,
			fixHint: "Ensure description is a string literal",
		};
	}

	if (description.length < 1 || description.length > 100) {
		return {
			path,
			commandName,
			field: "description",
			value: description,
			message: `${context} description length is ${description.length}, must be 1-100 characters`,
			fixHint: "Adjust description to be 1-100 characters",
		};
	}

	return null;
}

function validateRequiredOrder(
	options: Record<string, OptionLike>,
	path: string,
	commandName: string,
): ValidationIssue | null {
	const optionList = Object.entries(options);
	let foundOptional = false;

	for (const [key, opt] of optionList) {
		const isRequired = opt.required === true;

		if (!isRequired && !foundOptional) {
			foundOptional = true;
		} else if (isRequired && foundOptional) {
			return {
				path: `${path}.options`,
				commandName,
				field: `options.${key}.required`,
				value: true,
				message: `Required option "${key}" appears after optional options`,
				fixHint: "Reorder options so all required options come before optional ones",
			};
		}
	}

	return null;
}

function validateOption(
	key: string,
	option: OptionLike,
	path: string,
	commandName: string,
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const optionPath = `${path}.options.${key}`;

	// Validate option name if it exists and is different from key
	if (option.name !== undefined && option.name !== key) {
		const issue = validateName(
			option.name,
			"Option",
			`${optionPath}.name`,
			commandName,
		);
		if (issue) issues.push(issue);
	}

	// Also validate the key itself as it serves as the option name
	const keyIssue = validateName(
		key,
		"Option key",
		`${optionPath}`,
		commandName,
	);
	if (keyIssue) issues.push(keyIssue);

	// Validate description
	const descIssue = validateDescription(
		option.description,
		`Option "${key}"`,
		`${optionPath}.description`,
		commandName,
	);
	if (descIssue) issues.push(descIssue);

	// Recursively validate sub-options (for subcommands)
	if (option.options && typeof option.options === "object") {
		const orderIssue = validateRequiredOrder(option.options, optionPath, commandName);
		if (orderIssue) issues.push(orderIssue);

		for (const [subKey, subOpt] of Object.entries(option.options)) {
			const subIssues = validateOption(subKey, subOpt, optionPath, commandName);
			issues.push(...subIssues);
		}
	}

	return issues;
}

/**
 * Checks for duplicate command names.
 */
function checkDuplicateNames(commands: CommandLike[]): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const nameMap = new Map<string, number[]>();

	for (let i = 0; i < commands.length; i++) {
		const cmd = commands[i];
		const name = cmd.name ?? `#${i}`;
		const indices = nameMap.get(name) ?? [];
		indices.push(i);
		nameMap.set(name, indices);
	}

	for (const [name, indices] of nameMap.entries()) {
		if (indices.length > 1) {
			issues.push({
				path: indices.map((i) => `${i}.name`).join(", "),
				commandName: name,
				field: "name",
				value: name,
				message: `Duplicate command name "${name}" found at indices: ${indices.join(", ")}`,
				fixHint: `Rename or remove one of the duplicate commands. Found ${indices.length} commands with the same name.`,
			});
		}
	}

	return issues;
}

/**
 * Validates a command payload before sending to Discord API.
 * Returns array of issues found (empty if valid).
 */
export function validateCommandPayload(commands: CommandLike[]): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	// Check for duplicate names first
	const duplicateIssues = checkDuplicateNames(commands);
	issues.push(...duplicateIssues);

	for (let i = 0; i < commands.length; i++) {
		const cmd = commands[i];
		const path = `${i}`;

		// Validate command name
		const nameIssue = validateName(
			cmd.name ?? "",
			"Command",
			`${path}.name`,
			cmd.name ?? `#${i}`,
		);
		if (nameIssue) issues.push(nameIssue);

		// Validate command description
		const descIssue = validateDescription(
			cmd.description,
			`Command "${cmd.name ?? "#" + i}"`,
			`${path}.description`,
			cmd.name ?? `#${i}`,
		);
		if (descIssue) issues.push(descIssue);

		// Validate options
		if (cmd.options && typeof cmd.options === "object") {
			const orderIssue = validateRequiredOrder(cmd.options, path, cmd.name ?? `#${i}`);
			if (orderIssue) issues.push(orderIssue);

			for (const [key, option] of Object.entries(cmd.options)) {
				const optionIssues = validateOption(key, option, path, cmd.name ?? `#${i}`);
				issues.push(...optionIssues);
			}
		}
	}

	return issues;
}

/**
 * Formats validation issues into a human-readable report.
 */
export function printIssues(issues: ValidationIssue[], commands: CommandLike[]): string {
	if (issues.length === 0) {
		return "✅ No validation issues found.";
	}

	const lines: string[] = [
		"",
		"╔══════════════════════════════════════════════════════════════════════╗",
		`║  COMMAND PREFLIGHT VALIDATION FAILED: ${issues.length} issue${issues.length > 1 ? "s" : ""} found        ║`,
		"╚══════════════════════════════════════════════════════════════════════╝",
		"",
	];

	for (let i = 0; i < issues.length; i++) {
		const issue = issues[i];
		lines.push(`Issue #${i + 1}:`);
		lines.push(`  📍 Path:         ${issue.path}`);
		lines.push(`  🔤 Command:      ${issue.commandName}`);
		lines.push(`  📝 Field:        ${issue.field}`);
		lines.push(`  ⚠️  Message:      ${issue.message}`);
		lines.push(`  💡 Fix hint:     ${issue.fixHint}`);
		lines.push("");
	}

	lines.push("──────────────────────────────────────────────────────────────────────");
	lines.push(`Total commands checked: ${commands.length}`);
	lines.push("Startup aborted. Fix the issues above and try again.");
	lines.push("");

	return lines.join("\n");
}

/**
 * Checks if issues are critical (should abort startup).
 */
export function hasCriticalIssues(issues: ValidationIssue[]): boolean {
	return issues.length > 0;
}
