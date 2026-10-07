import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

export const ASSISTENTE_OAUTH_SCOPES = [
  "mcp:read",
  "mcp:write",
  "offline_access",
] as const;

const MIN_PASSWORD_BYTES = 32;

export function isOAuthPasswordConfigured(password: string | undefined): boolean {
  return (
    typeof password === "string" &&
    new TextEncoder().encode(password).byteLength >= MIN_PASSWORD_BYTES
  );
}

export function hasValidOAuthPassword(
  expected: string | undefined,
  supplied: FormDataEntryValue | null,
): boolean {
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

export function hasAllOAuthScopes(
  grantedScopes: readonly string[],
  requiredScopes: readonly string[],
): boolean {
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

export function requiredOAuthScopesForToolCall(
  isWriteToolCall: boolean,
): readonly string[] {
  return isWriteToolCall
    ? ["mcp:read", "mcp:write"]
    : ["mcp:read"];
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const code = character.charCodeAt(0);
    return "&#" + code + ";";
  });
}

function labelForScope(scope: string): string {
  if (scope === "mcp:read") return "Ler e pesquisar ferramentas conectadas";
  if (scope === "mcp:write") return "Executar operações que podem alterar recursos";
  if (scope === "offline_access") return "Manter a conexão com tokens renováveis";
  return "Permissão solicitada pelo cliente";
}

export function renderConsentPage(
  details: ConsentDescription,
  handle: string,
): string {
  const clientName = escapeHtml(details.clientName);
  const redirectHost = escapeHtml(details.redirectHost);
  const publisher = details.clientDomain
    ? "Publicador identificado: <strong>" + escapeHtml(details.clientDomain) + "</strong>."
    : "O nome deste aplicativo foi informado pelo próprio cliente e não foi verificado.";
  const scopes = details.scope.length === 0
    ? "<p>O cliente não solicitou escopos adicionais.</p>"
    : "<ul>" + details.scope.map((scope) =>
        "<li><code>" + escapeHtml(scope) + "</code>: " +
        escapeHtml(labelForScope(scope)) + "</li>"
      ).join("") + "</ul>";
  const loopbackWarning = details.redirectIsLoopback
    ? "<p><strong>A autorização será enviada a um aplicativo neste computador. Continue somente se você iniciou esta conexão.</strong></p>"
    : "";

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
    "<p>" + publisher + " O código de autorização será enviado para <strong>" + redirectHost + "</strong>.</p>",
    loopbackWarning,
    "<h2>Permissões solicitadas</h2>",
    scopes,
    "<form method=\"post\" action=\"/authorize\">",
    '<input type="hidden" name="handle" value="' + escapeHtml(handle) + '">',
    "<p><label for=\"password\">Senha de autorização do Assistente</label></p>",
    '<p><input id="password" name="password" type="password" required autocomplete="current-password"></p>',
    '<p><button name="decision" value="approve">Permitir</button> ',
    '<button name="decision" value="deny" formnovalidate>Negar</button></p>',
    "</form>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

export function renderPasswordRetryPage(handle: string): string {
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
    "<form method=\"post\" action=\"/authorize\">",
    '<input type="hidden" name="handle" value="' + escapeHtml(handle) + '">',
    '<input type="hidden" name="decision" value="approve">',
    "<p><label for=\"password\">Senha de autorização do Assistente</label></p>",
    '<p><input id="password" name="password" type="password" required autocomplete="current-password" autofocus></p>',
    "<p><button>Continuar</button></p>",
    "</form>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestUsesWriteTool(
  request: Request,
  writeToolNames: readonly string[],
): Promise<boolean> {
  if (request.method !== "POST") return false;

  const body = await request.clone().json().catch(() => undefined);
  const messages = Array.isArray(body) ? body : [body];

  return messages.some((message) => {
    if (!isRecord(message) || message.method !== "tools/call") return false;
    if (!isRecord(message.params) || typeof message.params.name !== "string") {
      return false;
    }
    return writeToolNames.includes(message.params.name);
  });
}
