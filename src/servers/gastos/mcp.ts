import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { DOMAIN_TOOL_CATALOG } from "../../contracts/domain-tools.ts";
import type { D1Database } from "../../shared/d1.ts";
import { DomainOperationError, safeDomainError } from "../../shared/errors.ts";
import { createAuthenticatedMcpWorker } from "../../shared/authenticated-mcp-worker.ts";
import {
  deleteExpense,
  editExpense,
  listExpenses,
  registerExpense,
  setExpenseStatus,
  summarizeExpenses,
  type EditExpenseInput,
  type RegisterExpenseInput,
} from "./service.ts";

export interface GastosEnvironment {
  GASTOS_DB: D1Database;
  MCP_TOKEN?: string;
}

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export function createGastosMcpServer(database: D1Database): McpServer {
  const server = new McpServer({ name: "assistente-gastos", version: "0.2.0" });

  for (const tool of DOMAIN_TOOL_CATALOG.filter((item) => item.serverId === "gastos")) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema),
      },
      async (input) => {
        try {
          if (tool.name === "consultar_movimentacoes") {
            return jsonResult(await listExpenses(database, input as {
              mes?: string;
              tipo?: "entrada" | "saida";
              status?: "pago" | "pendente";
              limite?: number;
              deslocamento?: number;
            }));
          }
          if (tool.name === "resumo_movimentacoes") {
            return jsonResult(await summarizeExpenses(database, input.mes as string | undefined));
          }
          if (tool.name === "registrar_movimentacao") {
            const result = await registerExpense(
              database,
              input as unknown as RegisterExpenseInput,
            );
            if (result.status === "resultado_incerto") {
              return {
                isError: true,
                content: [{
                  type: "text" as const,
                  text: "A gravação pode ter sido concluída, mas a confirmação se perdeu. Consulte o mês antes de tentar novamente.",
                }],
              };
            }
            return jsonResult(result);
          }
          if (tool.name === "editar_movimentacao") {
            return jsonResult(
              await editExpense(database, input as unknown as EditExpenseInput),
            );
          }
          if (tool.name === "marcar_pagamento") {
            return jsonResult(await setExpenseStatus(database, input as {
              mes: string;
              id: number;
              status: "pago" | "pendente";
            }));
          }
          return jsonResult(await deleteExpense(database, input as {
            mes: string;
            id: number;
            confirmar: boolean;
          }));
        } catch (error) {
          if (error instanceof DomainOperationError) {
            return safeDomainError(error, "Não consegui validar a solicitação de gastos.");
          }
          return safeDomainError(
            error,
            tool.isWrite
              ? "A confirmação da operação se perdeu. Consulte o lançamento antes de tentar novamente."
              : "Não consegui consultar o D1 de gastos.",
          );
        }
      },
    );
  }

  return server;
}

export default createAuthenticatedMcpWorker(
  (environment: GastosEnvironment) => createGastosMcpServer(environment.GASTOS_DB),
  (environment: GastosEnvironment) => environment.MCP_TOKEN,
);
