import { PC_TOOL_CATALOG, pcResultToMcp } from "./tools.ts";
export { PC_TOOL_CATALOG };
export interface PcNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface PcEnvironment {
  PC_AGENT_TOKEN?: string;
  PC_RELAY?: PcNamespace;
}
function broker(environment: PcEnvironment) {
  if (!environment.PC_AGENT_TOKEN || environment.PC_AGENT_TOKEN.length < 32 || !environment.PC_RELAY) return undefined;
  return environment.PC_RELAY.get(environment.PC_RELAY.idFromName("principal"));
}
export function pcIsConfigured(environment: PcEnvironment): boolean { return broker(environment) !== undefined; }
export async function pcAgentRequest(request: Request, environment: PcEnvironment): Promise<Response> {
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Upgrade required", { status: 426 });
  const configured = broker(environment);
  if (!configured) return new Response("Unavailable", { status: 503 });
  const value = request.headers.get("Authorization") ?? "";
  const supplied = new TextEncoder().encode(value);
  const expected = new TextEncoder().encode("Bearer " + environment.PC_AGENT_TOKEN);
  let difference = supplied.length ^ expected.length;
  for (let i = 0; i < Math.max(supplied.length, expected.length); i++) difference |= (supplied[i] ?? 0) ^ (expected[i] ?? 0);
  if (difference !== 0) return new Response("Unauthorized", { status: 401 });
  return configured.fetch(new Request("https://relay.internal/connect", { headers: { Upgrade: "websocket" } }));
}
export async function pcCall(environment: PcEnvironment, name: string, args: Record<string, unknown>) {
  const stub = broker(environment);
  if (!stub) return pcResultToMcp({ ok: false, error: "Controle do PC não configurado." });
  try {
    const response = name === "pc_status"
      ? await stub.fetch(new Request("https://relay.internal/status"))
      : await stub.fetch(new Request("https://relay.internal/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), name, args }),
      }));
    if (!response.ok && response.status !== 503) return pcResultToMcp({ ok: false, error: "Erro de comunicação com o computador." });
    return pcResultToMcp(await response.json());
  } catch {
    return pcResultToMcp({ ok: false, error: "Não foi possível confirmar a operação no computador." });
  }
}
