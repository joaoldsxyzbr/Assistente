const ASSISTENTE_OAUTH_SCOPES = [
  "mcp:read",
  "mcp:write",
  "offline_access"
];
const MIN_PASSWORD_BYTES = 32;
function isOAuthPasswordConfigured(password) {
  return typeof password === "string" && new TextEncoder().encode(password).byteLength >= MIN_PASSWORD_BYTES;
}
function hasValidOAuthPassword(expected, supplied) {
  if (!isOAuthPasswordConfigured(expected) || typeof supplied !== "string") {
    return false;
  }
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const suppliedBytes = encoder.encode(supplied);
  let difference = expectedBytes.length ^ suppliedBytes.length;
  const length = Math.max(expectedBytes.length, suppliedBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (suppliedBytes[index] ?? 0);
  }
  return difference === 0;
}
function hasAllOAuthScopes(grantedScopes, requiredScopes) {
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}
function requiredOAuthScopesForToolCall(isWriteToolCall) {
  return isWriteToolCall ? ["mcp:read", "mcp:write"] : ["mcp:read"];
}
function oauthSecuritySchemesForTool(isWriteToolCall) {
  return [{
    type: "oauth2",
    scopes: [...requiredOAuthScopesForToolCall(isWriteToolCall)]
  }];
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const code = character.charCodeAt(0);
    return "&#" + code + ";";
  });
}
function labelForScope(scope) {
  if (scope === "mcp:read") return "Ler e pesquisar ferramentas conectadas";
  if (scope === "mcp:write") return "Executar opera\xE7\xF5es que podem alterar recursos";
  if (scope === "offline_access") return "Manter a conex\xE3o com tokens renov\xE1veis";
  return "Permiss\xE3o solicitada pelo cliente";
}
function renderConsentPage(details, formAction) {
  const clientName = escapeHtml(details.clientName);
  const redirectHost = escapeHtml(details.redirectHost);
  const safeAction = escapeHtml(formAction);
  const publisher = details.clientDomain ? "Publicador identificado: <strong>" + escapeHtml(details.clientDomain) + "</strong>." : "O nome deste aplicativo foi informado pelo pr\xF3prio cliente e n\xE3o foi verificado.";
  const scopes = details.scope.length === 0 ? "<p>O cliente n\xE3o solicitou escopos adicionais.</p>" : "<ul>" + details.scope.map(
    (scope) => "<li><code>" + escapeHtml(scope) + "</code>: " + escapeHtml(labelForScope(scope)) + "</li>"
  ).join("") + "</ul>";
  const loopbackWarning = details.redirectIsLoopback ? "<p><strong>A autoriza\xE7\xE3o ser\xE1 enviada a um aplicativo neste computador. Continue somente se voc\xEA iniciou esta conex\xE3o.</strong></p>" : "";
  return [
    "<!doctype html>",
    '<html lang="pt-BR">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Autorizar " + clientName + "</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Permitir que " + clientName + " acesse o Assistente?</h1>",
    "<p>" + publisher + " O c\xF3digo de autoriza\xE7\xE3o ser\xE1 enviado para <strong>" + redirectHost + "</strong>.</p>",
    loopbackWarning,
    "<h2>Permiss\xF5es solicitadas</h2>",
    scopes,
    '<form method="post" action="' + safeAction + '">',
    '<p><label for="password">Senha de autoriza\xE7\xE3o do Assistente</label></p>',
    '<p><input id="password" name="password" type="password" required autocomplete="current-password"></p>',
    '<p><button name="decision" value="approve">Permitir</button> ',
    '<button name="decision" value="deny" formnovalidate>Negar</button></p>',
    "</form>",
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}
function renderPasswordRetryPage(formAction) {
  const safeAction = escapeHtml(formAction);
  return [
    "<!doctype html>",
    '<html lang="pt-BR">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Verificar acesso</title>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>Senha incorreta</h1>",
    "<p>Confira a senha do Assistente e tente novamente.</p>",
    '<form method="post" action="' + safeAction + '">',
    '<input type="hidden" name="decision" value="approve">',
    '<p><label for="password">Senha de autoriza\xE7\xE3o do Assistente</label></p>',
    '<p><input id="password" name="password" type="password" required autocomplete="current-password" autofocus></p>',
    "<p><button>Continuar</button></p>",
    "</form>",
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function requestUsesWriteTool(request, writeToolNames) {
  if (request.method !== "POST") return false;
  const body = await request.clone().json().catch(() => void 0);
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => {
    if (!isRecord(message) || message.method !== "tools/call") return false;
    if (!isRecord(message.params) || typeof message.params.name !== "string") {
      return false;
    }
    return writeToolNames.includes(message.params.name);
  });
}
export {
  ASSISTENTE_OAUTH_SCOPES,
  escapeHtml,
  hasAllOAuthScopes,
  hasValidOAuthPassword,
  isOAuthPasswordConfigured,
  oauthSecuritySchemesForTool,
  renderConsentPage,
  renderPasswordRetryPage,
  requestUsesWriteTool,
  requiredOAuthScopesForToolCall
};
