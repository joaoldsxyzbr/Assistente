export interface ConcurrentResponseCoalescer {
  run(key: string, execute: () => Promise<Response>): Promise<Response>;
}

export function createConcurrentResponseCoalescer(
  retentionMs = 2_000,
): ConcurrentResponseCoalescer {
  const entries = new Map<string, {
    expiresAt: number;
    response: Promise<Response>;
  }>();

  return {
    async run(key, execute) {
      const now = Date.now();

      for (const [entryKey, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(entryKey);
      }

      const existing = entries.get(key);
      if (existing !== undefined) {
        return (await existing.response).clone();
      }

      const pending = execute();
      entries.set(key, {
        expiresAt: now + retentionMs,
        response: pending,
      });

      try {
        const response = await pending;
        if (response.status < 300 || response.status >= 400) {
          entries.delete(key);
        }
        return response.clone();
      } catch (error) {
        entries.delete(key);
        throw error;
      }
    },
  };
}
