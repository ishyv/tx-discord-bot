/**
 * Motivation: Retrieve context messages around a quoted text to fuel contextualized responses.
 *
 * Idea/concept: Uses term-based search and configurable limits to extract relevant parts of history.
 *
 * Scope: Provides immediate context; does not attempt to retrieve full threads or long-term persistence.
 */
import type { Message } from "@/utils/userMemory";

/**
 * Processes a quoted text to try and reconstruct part of the context.
 * You could extend this here to search by message ID or thread if desired.
 */
export const getContextMessages = async (
  quotedText: string,
): Promise<Message[]> => {
  if (!quotedText || quotedText.trim().length === 0) {
    return [];
  }

  // TODO: extract information from previous messages

  const contextMessage: Message = {
    role: "user",
    content: quotedText.trim(),
  };

  return [contextMessage];
};
