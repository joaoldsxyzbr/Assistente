import type { McpServerId } from "../host/contracts.ts";

export interface McpToolContract {
  serverId: McpServerId;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isWrite: boolean;
}
