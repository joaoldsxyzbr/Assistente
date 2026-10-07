type AuditValue = string | number | boolean | readonly string[];

const ALLOWED_FIELDS = new Set([
  "stage",
  "status",
  "outcome",
  "server",
  "tool",
  "write",
  "uncertain",
  "scopes",
]);

export function audit(
  level: "info" | "warn",
  event: string,
  fields: Readonly<Record<string, AuditValue | undefined>> = {},
): void {
  const record: Record<string, AuditValue> = { event };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && ALLOWED_FIELDS.has(key)) {
      record[key] = value;
    }
  }

  const message = JSON.stringify(record);
  if (level === "warn") console.warn(message);
  else console.log(message);
}
