/**
 * Pretty Discord 50035 Error Printer
 *
 * Purpose: Maps obscure Discord API error paths to human-readable command names.
 * Context: Wraps command registration to provide actionable error messages.
 * Dependencies: None (pure formatting logic).
 */

export interface ParsedError {
	path: string;
	code: string;
	message: string;
}

export interface ErrorContext {
	commandName: string;
	optionChain: string[];
	parentSnippet: unknown;
	offendingValue: unknown;
}

interface CommandLike {
	name?: string;
	options?: Record<string, OptionLike>;
}

interface OptionLike {
	name?: string;
	options?: Record<string, OptionLike>;
	[key: string]: unknown;
}

/**
 * Parses a Discord 50035 error string.
 * Example: "1.options.0.options.2.name [APPLICATION_COMMAND_INVALID_NAME]"
 */
export function parseDiscordError(errorString: string): ParsedError | null {
	// Match patterns like "40.options.0.name [APPLICATION_COMMAND_INVALID_NAME]: ..."
	// or "40.options.0.options.2.name [APPLICATION_COMMAND_INVALID_NAME]"
	const match = errorString.match(/^(\d+(?:\.\w+\.\d+)*(?:\.\w+)?)\s*\[([\w_]+)\]\s*:?\s*(.*)?$/);
	
	if (!match) {
		// Try alternative pattern for simpler errors
		const altMatch = errorString.match(/^(\d+(?:\.\w+)?)\s*\[([\w_]+)\]\s*:?\s*(.*)?$/);
		if (!altMatch) return null;
		
		return {
			path: altMatch[1].trim(),
			code: altMatch[2],
			message: altMatch[3] || altMatch[2],
		};
	}

	return {
		path: match[1].trim(),
		code: match[2],
		message: match[3] || match[2],
	};
}

/**
 * Traverses a commands payload using a Discord-style path.
 * Path format: "1.options.0.options.2.name"
 * Returns the resolved context or null if path is invalid.
 */
export function resolveErrorContext(
	path: string,
	commands: CommandLike[],
): ErrorContext | null {
	const parts = path.split(".");
	if (parts.length < 1) return null;

	const cmdIndex = Number.parseInt(parts[0], 10);
	if (Number.isNaN(cmdIndex) || cmdIndex < 0 || cmdIndex >= commands.length) {
		return null;
	}

	const command = commands[cmdIndex];
	const commandName = command?.name || `#${cmdIndex}`;
	const optionChain: string[] = [];
	let current: OptionLike | undefined = command as OptionLike;
	let parentSnippet: unknown = command;

	// Traverse options
	for (let i = 1; i < parts.length; i++) {
		const part = parts[i];

		if (part === "options" && i + 1 < parts.length) {
			const optIndex = Number.parseInt(parts[i + 1], 10);
			if (Number.isNaN(optIndex)) {
				// Named option key
				if (current?.options && typeof current.options === "object") {
					parentSnippet = current.options;
					current = current.options[parts[i + 1]];
					if (current?.name) {
						optionChain.push(current.name);
					}
				}
				i++;
			} else if (current?.options && Array.isArray(current.options)) {
				// Array index access
				parentSnippet = current.options;
				current = current.options[optIndex];
				if (current?.name) {
					optionChain.push(current.name);
				}
				i++;
			} else if (current?.options && typeof current.options === "object") {
				// Object with numeric keys (unlikely but possible)
				const entries = Object.entries(current.options);
				if (optIndex >= 0 && optIndex < entries.length) {
					parentSnippet = current.options;
					const [, optValue] = entries[optIndex];
					current = optValue;
					if (current?.name) {
						optionChain.push(current.name);
					}
				}
				i++;
			}
		} else if (part === "name" || part === "description") {
			// We're at the field level
			continue;
		}
	}

	// Get offending value
	const lastPart = parts[parts.length - 1];
	const offendingValue = current && typeof current === "object" && lastPart in current
		? (current as Record<string, unknown>)[lastPart]
		: undefined;

	return {
		commandName,
		optionChain,
		parentSnippet,
		offendingValue,
	};
}

/**
 * Maps Discord error codes to human-readable explanations.
 */
function getErrorExplanation(code: string): string {
	const explanations: Record<string, string> = {
		APPLICATION_COMMAND_INVALID_NAME: "Command/option name contains invalid characters or format",
		APPLICATION_COMMAND_INVALID_DESCRIPTION: "Description is missing, too long, or invalid",
		APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID: "Required option placed after optional option",
		APPLICATION_COMMAND_DUPLICATE_NAME: "Duplicate command or option name found",
		APPLICATION_COMMAND_TOO_MANY_OPTIONS: "Too many options defined (max 25)",
		APPLICATION_COMMAND_OPTION_NAME_INVALID: "Option name contains invalid characters",
		APPLICATION_COMMAND_OPTION_DESCRIPTION_INVALID: "Option description is invalid",
		APPLICATION_COMMAND_OPTION_TYPE_INVALID: "Invalid option type specified",
		APPLICATION_COMMAND_OPTIONS_NAME_ALREADY_EXISTS: "Option name already used in this command",
		APPLICATION_COMMAND_OPTION_CHOICES_VALUE_INVALID: "Invalid choice value specified",
		APPLICATION_COMMAND_OPTION_CHOICES_NAME_INVALID: "Invalid choice name specified",
		BASE_TYPE_BAD_LENGTH: "String length is outside allowed bounds",
		BASE_TYPE_BAD_CHARS: "String contains invalid characters",
		BASE_TYPE_STRING_VALUE_REGEX_MISMATCH: "Value doesn't match required pattern",
	};

	return explanations[code] || `Unknown error code: ${code}`;
}

/**
 * Pretty-prints a Discord 50035 error with context.
 */
export function prettyPrintDiscord50035(
	error: Error,
	commandsPayload: unknown[],
): string {
	const errorString = error.message || String(error);
	
	const lines: string[] = [
		"",
		"╔══════════════════════════════════════════════════════════════════════╗",
		"║  DISCORD API ERROR: Command Registration Failed                      ║",
		"╚══════════════════════════════════════════════════════════════════════╝",
		"",
		`Raw error: ${errorString}`,
		"",
	];

	// Try to parse the error
	const parsed = parseDiscordError(errorString);
	
	if (!parsed) {
		lines.push("⚠️  Could not parse error path. Full payload:");
		lines.push(JSON.stringify(commandsPayload, null, 2).slice(0, 2000));
		return lines.join("\n");
	}

	lines.push(`🔍 Parsed path:     ${parsed.path}`);
	lines.push(`🔍 Error code:      ${parsed.code}`);
	lines.push(`📝 Explanation:     ${getErrorExplanation(parsed.code)}`);
	lines.push("");

	// Resolve context
	const context = resolveErrorContext(parsed.path, commandsPayload as CommandLike[]);

	if (!context) {
		lines.push("⚠️  Could not resolve error context from payload.");
		lines.push("");
		lines.push("Payload snapshot (first 10 commands):");
		const snapshot = (commandsPayload as CommandLike[]).slice(0, 10).map((cmd, i) => ({
			index: i,
			name: cmd?.name || "(unnamed)",
		}));
		lines.push(JSON.stringify(snapshot, null, 2));
		return lines.join("\n");
	}

	// Build human-readable path
	const readablePath = context.optionChain.length > 0
		? `/${context.commandName} -> ${context.optionChain.join(" -> ")}`
		: `/${context.commandName}`;

	lines.push(`📍 Command path:    ${readablePath}`);
	lines.push(`📦 Parent object:`);
	lines.push("```json");
	lines.push(JSON.stringify(context.parentSnippet, null, 2).slice(0, 500));
	lines.push("```");

	if (context.offendingValue !== undefined) {
		lines.push(`⚠️  Offending value: "${String(context.offendingValue)}"`);
	}

	lines.push("");
	lines.push("💡 Fix suggestions:");
	
	// Add specific fix hints based on error code
	switch (parsed.code) {
		case "APPLICATION_COMMAND_INVALID_NAME":
			lines.push("   • Use only lowercase letters (a-z), numbers (0-9), underscores (_), hyphens (-)");
			lines.push("   • Remove spaces, colons (:), dots (.), and special characters");
			lines.push("   • Maximum length: 32 characters");
			break;
		case "APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID":
			lines.push("   • Move ALL required options before optional ones");
			lines.push("   • Required: options with { required: true }");
			lines.push("   • Optional: options with { required: false } or no required field");
			break;
		case "APPLICATION_COMMAND_INVALID_DESCRIPTION":
			lines.push("   • Description is required (1-100 characters)");
			lines.push("   • Must be a non-empty string");
			break;
		default:
			lines.push("   • Check the error code documentation:");
			lines.push(`     https://discord.com/developers/docs/topics/opcodes-and-status-codes`);
	}

	lines.push("");
	lines.push("──────────────────────────────────────────────────────────────────────");
	lines.push("");

	return lines.join("\n");
}

/**
 * Wraps a command registration call with pretty error handling.
 */
export async function withPrettyErrorHandling<T>(
	operation: () => Promise<T>,
	commandsPayload: unknown[],
	logger: { error: (msg: string) => void; info: (msg: string) => void },
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		
		// Check if it's a 50035 error
		if (err.message?.includes("50035") || err.message?.includes("Invalid Form Body")) {
			const prettyOutput = prettyPrintDiscord50035(err, commandsPayload);
			logger.error(prettyOutput);
			
			// Throw a more descriptive error
			const parsed = parseDiscordError(err.message);
			if (parsed) {
				const context = resolveErrorContext(parsed.path, commandsPayload as CommandLike[]);
				const readablePath = context?.optionChain.length
					? `/${context.commandName} -> ${context.optionChain.join(" -> ")}`
					: `/${context?.commandName || "unknown"}`;
				
				throw new Error(
					`Command registration failed at ${readablePath}: ${parsed.code}. ` +
					`See logs for details.`
				);
			}
		}
		
		throw err;
	}
}
