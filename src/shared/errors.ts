export class DomainOperationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DomainOperationError";
  }
}

export function safeDomainError(
  error: unknown,
  fallback: string,
): { isError: true; content: [{ type: "text"; text: string }] } {
  const message =
    error instanceof DomainOperationError ? error.message : fallback;
  return { isError: true, content: [{ type: "text", text: message }] };
}
