export type DomainToolId = "ponto" | "gastos";

export interface DomainToolContract {
  serverId: DomainToolId;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isWrite: boolean;
}

const dateRangeSchema = {
  dataInicio: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  dataFim: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  limite: { type: "integer", minimum: 1, maximum: 100 },
};

export const DOMAIN_TOOL_CATALOG: readonly DomainToolContract[] = [
  {
    serverId: "ponto",
    name: "registrar_ponto",
    description:
      "Registra um horário no próximo campo vazio do dia. Pode receber data e campo explícitos; não altera um campo já preenchido.",
    inputSchema: {
      type: "object",
      properties: {
        horario: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
        data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        marcacao: {
          type: "string",
          enum: ["entrada", "ida_intervalo", "volta_intervalo", "saida"],
        },
      },
      required: ["horario"],
      additionalProperties: false,
    },
    isWrite: true,
  },
  {
    serverId: "ponto",
    name: "consultar_pontos",
    description:
      "Consulta os registros de ponto por intervalo de datas. Sem período, consulta somente o dia atual em America/Sao_Paulo.",
    inputSchema: {
      type: "object",
      properties: dateRangeSchema,
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "ponto",
    name: "consultar_ajustes_banco_horas",
    description:
      "Consulta ajustes registrados no banco de horas por intervalo de datas.",
    inputSchema: {
      type: "object",
      properties: {
        dataInicio: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        dataFim: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        limite: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "ponto",
    name: "registrar_ajuste_banco_horas",
    description:
      "Registra um ajuste explícito no banco de horas com data, minutos e motivo. Se encontrar um ajuste idêntico, pede confirmação antes de inserir outro.",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        ajusteMinutos: { type: "integer", minimum: -1440, maximum: 1440 },
        motivo: { type: "string", minLength: 1, maxLength: 250 },
        confirmarDuplicata: { type: "boolean" },
      },
      required: ["data", "ajusteMinutos", "motivo"],
      additionalProperties: false,
    },
    isWrite: true,
  },
  {
    serverId: "gastos",
    name: "consultar_movimentacoes",
    description:
      "Consulta lançamentos do mês informado ou do próximo mês local quando o período for omitido. Preserva os valores como estão gravados.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
        tipo: { type: "string", enum: ["entrada", "saida"] },
        status: { type: "string", enum: ["pago", "pendente"] },
        limite: { type: "integer", minimum: 1, maximum: 200 },
        deslocamento: { type: "integer", minimum: 0, maximum: 5000 },
      },
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "gastos",
    name: "resumo_movimentacoes",
    description:
      "Calcula entradas, saídas e saldo do mês. Se houver valor inválido, não apresenta total como confirmado.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
      },
      additionalProperties: false,
    },
    isWrite: false,
  },
  {
    serverId: "gastos",
    name: "registrar_movimentacao",
    description:
      "Registra uma entrada ou saída no D1 oficial. Antes de gravar, verifica duplicatas exatas e pede confirmação quando encontra uma possível repetição.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
        descricao: { type: "string", minLength: 1, maxLength: 200 },
        valor: { type: "string", minLength: 1, maxLength: 32 },
        tipo: { type: "string", enum: ["entrada", "saida"] },
        categoria: { type: "string", maxLength: 100 },
        status: { type: "string", enum: ["pago", "pendente"] },
        confirmarDuplicata: { type: "boolean" },
      },
      required: ["descricao", "valor", "tipo"],
      additionalProperties: false,
    },
    isWrite: true,
  },
  {
    serverId: "gastos",
    name: "editar_movimentacao",
    description:
      "Edita somente os campos informados de um lançamento identificado por mês e ID; consulta e confirma o resultado pelo próprio registro.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
        id: { type: "integer", minimum: 1 },
        descricao: { type: "string", minLength: 1, maxLength: 200 },
        valor: { type: "string", minLength: 1, maxLength: 32 },
        tipo: { type: "string", enum: ["entrada", "saida"] },
        categoria: { type: ["string", "null"], maxLength: 100 },
        status: { type: "string", enum: ["pago", "pendente"] },
      },
      required: ["mes", "id"],
      additionalProperties: false,
    },
    isWrite: true,
  },
  {
    serverId: "gastos",
    name: "marcar_pagamento",
    description:
      "Atualiza o status pago ou pendente do lançamento identificado por mês e ID. Use somente quando o usuário pedir essa alteração.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
        id: { type: "integer", minimum: 1 },
        status: { type: "string", enum: ["pago", "pendente"] },
      },
      required: ["mes", "id", "status"],
      additionalProperties: false,
    },
    isWrite: true,
  },
  {
    serverId: "gastos",
    name: "excluir_movimentacao",
    description:
      "Exclui um único lançamento por mês e ID. Só invoque após pedido explícito do usuário e envie confirmar=true.",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "string", pattern: "^\\d{4}-(?:0[1-9]|1[0-2])$" },
        id: { type: "integer", minimum: 1 },
        confirmar: { type: "boolean", const: true },
      },
      required: ["mes", "id", "confirmar"],
      additionalProperties: false,
    },
    isWrite: true,
  },
];
