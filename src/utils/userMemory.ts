/**
 * Motivation: Maintain a short history per user to provide context for AI responses without depending on external storage.
 *
 * Idea/concept: Uses an in-memory Map with message lists and append/trim operations that act as a buffer.
 *
 * Scope: Limited to process memory and recent conversations; it is not durable or distributed storage.
 */
export interface Message {
  role: string;
  content: string;
}

const DEFAULT_MEMORY_LIMIT = 20;

class UserMemoryStore {
  private memory: Map<string, Message[]> = new Map();
  private limit: number;

  constructor(limit: number = DEFAULT_MEMORY_LIMIT) {
    this.limit = limit;
  }

  /**
   * Retrieves the history for a user.
   */
  get(userId: string): Message[] {
    return this.memory.get(userId) ?? [];
  }

  /**
   * Adds a new message to the user's history.
   */
  append(userId: string, message: Message): void {
    const history = this.get(userId);
    history.push(message);

    // Keep history within the limit
    if (history.length > this.limit) {
      history.splice(0, history.length - this.limit);
    }

    this.memory.set(userId, history);
  }

  /**
   * Completely replaces a user's history.
   */
  set(userId: string, messages: Message[]): void {
    const trimmed = messages.slice(-this.limit);
    this.memory.set(userId, trimmed);
  }

  /**
   * Clears a user's memory.
   */
  clear(userId: string): void {
    this.memory.delete(userId);
  }

  /**
   * Clears all memory for all users.
   */
  clearAll(): void {
    this.memory.clear();
  }
}

export const userMemory = new UserMemoryStore();
