export interface DeleteSession {
    messageId: string;
    channelId: string;
    guildId: string;
    slug: string;
    invokerId: string;
    expiresAt: number;
}

const sessions = new Map<string, DeleteSession>();

export function storeDeleteSession(session: DeleteSession): void {
    sessions.set(session.messageId, session);
}

export function getDeleteSession(messageId: string): DeleteSession | undefined {
    const entry = sessions.get(messageId);
    if (entry && Date.now() > entry.expiresAt) {
        sessions.delete(messageId);
        return undefined;
    }
    return entry;
}

export function clearDeleteSession(messageId: string): void {
    sessions.delete(messageId);
}
