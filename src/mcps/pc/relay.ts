declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };
import { DurableObject } from "cloudflare:workers";
import { validPcArguments } from "./tools.ts";

interface PcCommand { id: string; name: string; args: Record<string, unknown> }
interface PcAnswer { id: string; ok: boolean; data?: unknown; image?: string; error?: string }
interface Pending { socket: WebSocket; finish: (answer: PcAnswer) => void }

function reply(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function validCommand(body: unknown): body is PcCommand {
  if (!body || typeof body !== "object") return false;
  const value = body as Partial<PcCommand>;
  return typeof value.id === "string" && /^[0-9a-f-]{36}$/.test(value.id)
    && typeof value.name === "string" && value.name !== "pc_status"
    && validPcArguments(value.name, value.args);
}

export class PcRelay extends DurableObject {
  private readonly pending = new Map<string, Pending>();

  private activeSocket(): WebSocket | undefined {
    return this.ctx.getWebSockets().find((socket) => socket.readyState === WebSocket.OPEN);
  }

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/connect" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return new Response("Upgrade required", { status: 426 });

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      // A conexão antiga pode permanecer no estado CLOSING durante a substituição.
      for (const old of this.ctx.getWebSockets()) {
        if (old !== server && old.readyState === WebSocket.OPEN) old.close(1000, "Reconnected");
      }
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    }

    if (pathname === "/status" && request.method === "GET") {
      return reply({ ok: true, data: { online: this.activeSocket() !== undefined } });
    }
    if (pathname !== "/command" || request.method !== "POST")
      return new Response("Not found", { status: 404 });

    const socket = this.activeSocket();
    if (!socket) return reply({ ok: false, error: "Computador desconectado." }, 503);
    // Evita que duas chamadas mudem o foco do teclado/mouse simultaneamente.
    if (this.pending.size !== 0)
      return reply({ ok: false, error: "Computador ocupado. Consulte o estado antes de repetir." }, 409);

    let body: unknown;
    try {
      const contentLength = Number(request.headers.get("Content-Length") ?? 0);
      if (contentLength > 8000) return reply({ ok: false, error: "Comando muito grande." }, 413);
      const payload = await request.text();
      if (payload.length > 8000) return reply({ ok: false, error: "Comando muito grande." }, 413);
      body = JSON.parse(payload);
    } catch {
      return reply({ ok: false, error: "Comando inválido." }, 400);
    }
    if (!validCommand(body)) return reply({ ok: false, error: "Comando não permitido." }, 400);
    const command = body;
    const result = await new Promise<PcAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        resolve({ id: command.id, ok: false, error: "Resultado incerto após timeout. Confira o estado antes de repetir." });
      }, 20_000);
      const finish = (answer: PcAnswer) => { clearTimeout(timer); resolve(answer); };
      this.pending.set(command.id, { socket, finish });
      try { socket.send(JSON.stringify(command)); }
      catch {
        this.pending.delete(command.id);
        finish({ id: command.id, ok: false, error: "Computador desconectado." });
      }
    });
    return reply(result);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 65_536) return;
    let body: unknown;
    try { body = JSON.parse(message); } catch { return; }
    if (!body || typeof body !== "object") return;
    const answer = body as Partial<PcAnswer>;
    if (typeof answer.id !== "string" || typeof answer.ok !== "boolean") return;
    const waiting = this.pending.get(answer.id);
    // Respostas atrasadas de conexões antigas nunca concluem comandos novos.
    if (!waiting || waiting.socket !== socket) return;
    this.pending.delete(answer.id);
    waiting.finish(answer as PcAnswer);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    for (const [id, waiting] of this.pending) {
      if (waiting.socket !== socket) continue;
      this.pending.delete(id);
      waiting.finish({ id, ok: false, error: "Conexão perdida. Confira o estado antes de repetir." });
    }
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket);
  }
}
