function isTimeout(error) {
  if (!(error instanceof Error)) return false;
  const code = error.code;
  return error.name === "TimeoutError" || code === "ETIMEDOUT" || /\b(?:timed?\s*out|timeout)\b/i.test(error.message);
}
function classifyRemoteCallFailure(error, isWrite, callStarted) {
  if (isWrite && callStarted) {
    return {
      outcome: "uncertain",
      uncertain: true,
      message: "O resultado da escrita \xE9 incerto. Consulte o registro no servi\xE7o de origem antes de tentar novamente."
    };
  }
  if (isTimeout(error)) {
    return {
      outcome: "timeout",
      uncertain: false,
      message: "O MCP de origem demorou al\xE9m do limite. Confira a conex\xE3o e tente novamente."
    };
  }
  return {
    outcome: "failed",
    uncertain: false,
    message: "O MCP de origem est\xE1 indispon\xEDvel ou rejeitou a chamada."
  };
}
export {
  classifyRemoteCallFailure
};
