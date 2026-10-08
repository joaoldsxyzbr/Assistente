declare module "cloudflare:workers" {
  /**
   * Tipagem mínima da API nativa do Workers utilizada pelo relay.
   * Não implementa o Durable Object em Node: o runtime Cloudflare fornece a classe.
   */
  export class DurableObject {
    protected readonly ctx: {
      acceptWebSocket(socket: WebSocket): void;
      getWebSockets(): WebSocket[];
    };
    constructor(state: unknown, env: unknown);
  }
}
