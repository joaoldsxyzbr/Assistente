export type RemoteCallFailure = {
  outcome: "uncertain" | "timeout" | "failed";
  uncertain: boolean;
  message: string;
};

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return error.name === "TimeoutError" ||
    code === "ETIMEDOUT" ||
    /\b(?:timed?\s*out|timeout)\b/i.test(error.message);
}

// Only a call initiated after a successful connection can have changed data.
// Never reuse remote exception messages: they may include sensitive details.
export function classifyRemoteCallFailure(
  error: unknown,
  isWrite: boolean,
  callStarted: boolean,
): RemoteCallFailure {
  if (isWrite && callStarted) {
    return {
      outcome: "uncertain",
      uncertain: true,
      message: "O resultado da escrita é incerto. Consulte o registro no serviço de origem antes de tentar novamente.",
    };
  }
  if (isTimeout(error)) {
    return {
      outcome: "timeout",
      uncertain: false,
      message: "O MCP de origem demorou além do limite. Confira a conexão e tente novamente.",
    };
  }
  return {
    outcome: "failed",
    uncertain: false,
    message: "O MCP de origem está indisponível ou rejeitou a chamada.",
  };
}
