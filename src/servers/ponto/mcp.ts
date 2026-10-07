import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { DOMAIN_TOOL_CATALOG } from "../../contracts/domain-tools.ts";
import type { D1Database } from "../../shared/d1.ts";
import { DomainOperationError, safeDomainError } from "../../shared/errors.ts";
import { createAuthenticatedMcpWorker } from "../../shared/authenticated-mcp-worker.ts";
import {
  listHourAdjustments,
  listPunches,
  registerPunch,
  registerHourAdjustment,
  type RegisterPunchInput,
} from "./service.ts";

export interface PontoEnvironment {
  PONTO_DB: D1Database;
  MCP_TOKEN?: string;
}

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export function createPontoMcpServer(database: D1Database): McpServer {
  const server = new McpServer({ name: "assistente-ponto", version: "0.2.0" });

  for (const tool of DOMAIN_TOOL_CATALOG.filter((item) => item.serverId === "ponto")) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema),
      },
      async (input) => {
        try {
          if (tool.name === "registrar_ponto") {
            const result = await registerPunch(
              database,
              input as unknown as RegisterPunchInput,
            );
            if (result.status === "resultado_incerto") {
              return {
                isError: true,
                content: [{
                  type: "text" as const,
                  text: "O resultado do registro é incerto. Consulte os pontos do dia antes de tentar novamente.",
                }],
              };
            }
            return jsonResult(result);
          }

          if (tool.name === "consultar_pontos") {
            return jsonResult(await listPunches(database, input as {
              dataInicio?: string;
              dataFim?: string;
              limite?: number;
            }));
          }

          if (tool.name === "consultar_ajustes_banco_horas") {
            return jsonResult(await listHourAdjustments(database, input as {
              dataInicio?: string;
              dataFim?: string;
              limite?: number;
            }));
          }

          const result = await registerHourAdjustment(database, input as {
            data: string;
            ajusteMinutos: number;
            motivo: string;
            confirmarDuplicata?: boolean;
          });
          if (result.status === "resultado_incerto") {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: "O resultado do ajuste é incerto. Consulte os ajustes dessa data antes de tentar novamente.",
              }],
            };
          }
          return jsonResult(result);
        } catch (error) {
          if (error instanceof DomainOperationError) {
            return safeDomainError(error, "Não consegui validar a solicitação de ponto.");
          }
          return safeDomainError(
            error,
            tool.isWrite
              ? "A resposta do banco se perdeu. O ponto ou ajuste pode ter sido gravado; consulte a data antes de tentar novamente."
              : "Não consegui consultar o banco de ponto.",
          );
        }
      },
    );
  }

  return server;
}

export default createAuthenticatedMcpWorker(
  (environment: PontoEnvironment) => createPontoMcpServer(environment.PONTO_DB),
  (environment: PontoEnvironment) => environment.MCP_TOKEN,
);
