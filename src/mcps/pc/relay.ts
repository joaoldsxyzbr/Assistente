declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };
import { isPcTool } from "./tools.ts";
interface SocketState {
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
}
interface PcCommand { id: string; name: string; args: Record<string, unknown> }
interface PcAnswer { id: string; ok: boolean; data?: unknown; image?: string; error?: string }
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
function reply(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders });
}
function parsedCommand(body: unknown): body is PcCommand {
  return !!body && typeof body === "object"
    && "id" in body && typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id)
    && "name" in body && typeof body.name === "string" && isPcTool(body.name)
    && body.name !== "pc_status"
    && "args" in body && !!body.args && typeof body.args === "object" && !Array.isArray(body.args);
}
function parsedAnswer(value: unknown): value is PcAnswer {
  return !!value && typeof value === "object" && "id" in value && typeof value.id === "string"
    && "ok" in value && typeof value.ok === "boolean";
}
export class PcRelay {
  private readonly pending = new Map<string, (answer: PcAnswer) => void>();
  constructor(private readonly state: SocketState) {}
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/connect" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Upgrade required", { status: 426 });
      for (const old of this.state.getWebSockets()) old.close(1000, "Reconnected");
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    }
    if (pathname === "/status" && request.method === "GET") {
      return reply({ ok: true, data: { online: this.state.getWebSockets().length > 0 } });
    }
    if (pathname !== "/command" || request.method !== "POST") return new Response("Not found", { status: 404 });
    const socket = this.state.getWebSockets()[0];
    if (!socket) return reply({ ok: false, error: "Computador desconectado." }, 503);
    let body: unknown;
    try { body = await request.json(); } catch { return reply({ ok: false, error: "Comando inválido." }, 400); }
    if (!parsedCommand(body)) return reply({ ok: false, error: "Comando não permitido." }, 400);
    const command = body;
    if (JSON.stringify(command).length > 8_000) return reply({ ok: false, error: "Comando muito grande." }, 413);
    const response = await new Promise<PcAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        resolve({ id: command.id, ok: false, error: "Tempo esgotado; verifique o estado antes de repetir uma ação." });
      }, 20_000);
      this.pending.set(command.id, (value) => { clearTimeout(timer); resolve(value); });
      try { socket.send(JSON.stringify(command)); }
      catch {
        clearTimeout(timer);
        this.pending.delete(command.id);
        resolve({ id: command.id, ok: false, error: "Computador desconectado." });
      }
    });
    return reply(response);
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (socket !== this.state.getWebSockets()[0] || typeof message !== "string" || message.length > 1_400_000) return;
    let answer: unknown;
    try { answer = JSON.parse(message); } catch { return; }
    if (!parsedAnswer(answer)) return;
    const finish = this.pending.get(answer.id);
    if (finish) { this.pending.delete(answer.id); finish(answer); }
  }
  async webSocketClose(_socket: WebSocket): Promise<void> {
    for (const [id, finish] of this.pending) {
      this.pending.delete(id);
      finish({ id, ok: false, error: "Conexão perdida; confira o resultado antes de repetir." });
    }
  }
  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket);
  }
}
