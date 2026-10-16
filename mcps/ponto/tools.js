const PONTO_TOOL_CATALOG = [
  {
    name: "ponto_registrar",
    description: "Registra um hor\xE1rio no ponto do dia atual em America/Sao_Paulo, preenchendo automaticamente a pr\xF3xima batida v\xE1lida. De segunda a sexta usa entrada, ida do intervalo, volta do intervalo e sa\xEDda; s\xE1bado usa apenas entrada e sa\xEDda.",
    inputSchema: {
      type: "object",
      properties: {
        horario: {
          type: "string",
          description: "Hor\xE1rio em HHMM ou HH:MM.",
          pattern: "^(?:[01]\\d|2[0-3]):?[0-5]\\d$"
        }
      },
      required: ["horario"],
      additionalProperties: false
    },
    isWrite: true
  },
  {
    name: "ponto_hoje",
    description: "Retorna o resumo do ponto de hoje em America/Sao_Paulo, incluindo batidas, carga, tempo trabalhado, status e saldo do dia.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    isWrite: false
  },

  {
    name: "ponto_data",
    description: "Consulta ponto e saldo de uma data informada em DD/MM/AAAA, sem modificar registros.",
    inputSchema: { type: "object", properties: { data: { type: "string", description: "Data em DD/MM/AAAA" } }, required: ["data"], additionalProperties: false },
    isWrite: false
  },
  {
    name: "ponto_periodo",
    description: "Consulta os registros do ponto em um intervalo de até 93 dias, sem modificar registros.",
    inputSchema: { type: "object", properties: { inicio: { type: "string", description: "DD/MM/AAAA" }, fim: { type: "string", description: "DD/MM/AAAA" } }, required: ["inicio", "fim"], additionalProperties: false },
    isWrite: false
  },
  {
    name: "ponto_resumo",
    description: "Retorna o resumo acumulado do banco de horas diretamente da view oficial resumo.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    isWrite: false
  }
];
const WEEKDAY_REGISTER_SQL = `
INSERT INTO pontos (data, entrada)
VALUES (?1, ?2)
ON CONFLICT(data) DO UPDATE SET
  entrada = CASE
    WHEN pontos.entrada IS NULL THEN excluded.entrada
    ELSE pontos.entrada
  END,
  ida_intervalo = CASE
    WHEN pontos.entrada IS NOT NULL
     AND pontos.ida_intervalo IS NULL
    THEN excluded.entrada
    ELSE pontos.ida_intervalo
  END,
  volta_intervalo = CASE
    WHEN pontos.entrada IS NOT NULL
     AND pontos.ida_intervalo IS NOT NULL
     AND pontos.volta_intervalo IS NULL
    THEN excluded.entrada
    ELSE pontos.volta_intervalo
  END,
  saida = CASE
    WHEN pontos.entrada IS NOT NULL
     AND pontos.ida_intervalo IS NOT NULL
     AND pontos.volta_intervalo IS NOT NULL
     AND pontos.saida IS NULL
    THEN excluded.entrada
    ELSE pontos.saida
  END,
  atualizado_em = datetime('now')
WHERE excluded.entrada IS NOT pontos.entrada
  AND excluded.entrada IS NOT pontos.ida_intervalo
  AND excluded.entrada IS NOT pontos.volta_intervalo
  AND excluded.entrada IS NOT pontos.saida
  AND (pontos.entrada IS NULL OR pontos.ida_intervalo IS NULL OR pontos.entrada < pontos.ida_intervalo)
  AND (pontos.entrada IS NULL OR pontos.volta_intervalo IS NULL OR pontos.entrada < pontos.volta_intervalo)
  AND (pontos.entrada IS NULL OR pontos.saida IS NULL OR pontos.entrada < pontos.saida)
  AND (pontos.ida_intervalo IS NULL OR pontos.volta_intervalo IS NULL OR pontos.ida_intervalo < pontos.volta_intervalo)
  AND (pontos.ida_intervalo IS NULL OR pontos.saida IS NULL OR pontos.ida_intervalo < pontos.saida)
  AND (pontos.volta_intervalo IS NULL OR pontos.saida IS NULL OR pontos.volta_intervalo < pontos.saida)
  AND (
    (
      pontos.entrada IS NULL
      AND (pontos.ida_intervalo IS NULL OR excluded.entrada < pontos.ida_intervalo)
      AND (pontos.volta_intervalo IS NULL OR excluded.entrada < pontos.volta_intervalo)
      AND (pontos.saida IS NULL OR excluded.entrada < pontos.saida)
    )
    OR (
      pontos.entrada IS NOT NULL
      AND pontos.ida_intervalo IS NULL
      AND excluded.entrada > pontos.entrada
      AND (pontos.volta_intervalo IS NULL OR excluded.entrada < pontos.volta_intervalo)
      AND (pontos.saida IS NULL OR excluded.entrada < pontos.saida)
    )
    OR (
      pontos.entrada IS NOT NULL
      AND pontos.ida_intervalo IS NOT NULL
      AND pontos.volta_intervalo IS NULL
      AND excluded.entrada > pontos.ida_intervalo
      AND (pontos.saida IS NULL OR excluded.entrada < pontos.saida)
    )
    OR (
      pontos.entrada IS NOT NULL
      AND pontos.ida_intervalo IS NOT NULL
      AND pontos.volta_intervalo IS NOT NULL
      AND pontos.saida IS NULL
      AND excluded.entrada > pontos.volta_intervalo
    )
  )
RETURNING data, entrada, ida_intervalo, volta_intervalo, saida;
`.trim();
const SATURDAY_REGISTER_SQL = `
INSERT INTO pontos (data, entrada)
VALUES (?1, ?2)
ON CONFLICT(data) DO UPDATE SET
  entrada = CASE WHEN pontos.entrada IS NULL THEN excluded.entrada ELSE pontos.entrada END,
  saida = CASE
    WHEN pontos.entrada IS NOT NULL AND pontos.saida IS NULL THEN excluded.entrada
    ELSE pontos.saida
  END,
  atualizado_em = datetime('now')
WHERE pontos.ida_intervalo IS NULL
  AND pontos.volta_intervalo IS NULL
  AND excluded.entrada IS NOT pontos.entrada
  AND excluded.entrada IS NOT pontos.saida
  AND (
    (pontos.entrada IS NULL AND (pontos.saida IS NULL OR excluded.entrada < pontos.saida))
    OR
    (pontos.entrada IS NOT NULL AND pontos.saida IS NULL AND excluded.entrada > pontos.entrada)
  )
RETURNING data, entrada, ida_intervalo, volta_intervalo, saida;
`.trim();
const READ_DAY_SQL = `
SELECT data, entrada, ida_intervalo, volta_intervalo, saida
FROM pontos
WHERE data = ?1;
`.trim();
const TODAY_SUMMARY_SQL = `
SELECT
  data,
  entrada,
  ida_intervalo,
  volta_intervalo,
  saida,
  carga_minutos,
  trabalhado_minutos,
  saldo_final_minutos,
  status
FROM banco_horas
WHERE data = ?1;
`.trim();
const BANK_SUMMARY_SQL = `
SELECT dias_trabalhados, horas_trabalhadas, banco_horas
FROM resumo
LIMIT 1;
`.trim();
function currentPontoLocalDate(now = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "short"
  });
  const parts = formatter.formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = value("weekday");
  return {
    data: `${value("day")}/${value("month")}/${value("year")}`,
    weekday
  };
}
function normalizePontoHorario(value) {
  if (typeof value !== "string") return void 0;
  const normalized = value.trim().replace(":", "");
  if (!/^(?:[01]\d|2[0-3])[0-5]\d$/.test(normalized)) return void 0;
  return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
}
function d1RequestHelper(databaseId) {
  return `
    const databaseId = ${JSON.stringify(databaseId)};
    const query = async (sql, params = []) => {
      const response = await cloudflare.request({
        method: "POST",
        path: "/accounts/" + accountId + "/d1/database/" + databaseId + "/query",
        body: { sql, params },
      });
      const result = Array.isArray(response.result) ? response.result[0] : undefined;
      if (!result || result.success !== true) {
        throw new Error("D1 query failed");
      }
      return Array.isArray(result.results) ? result.results : [];
    };
  `;
}
function buildPontoRegistrarCode(databaseId, data, horario, saturday) {
  const registerSql = saturday ? SATURDAY_REGISTER_SQL : WEEKDAY_REGISTER_SQL;
  return `async () => {
    ${d1RequestHelper(databaseId)}
    const data = ${JSON.stringify(data)};
    const horario = ${JSON.stringify(horario)};
    const saturday = ${JSON.stringify(saturday)};
    const rows = await query(${JSON.stringify(registerSql)}, [data, horario]);

    if (rows.length > 0) {
      const row = rows[0];
      const fields = saturday
        ? ["entrada", "saida"]
        : ["entrada", "ida_intervalo", "volta_intervalo", "saida"];
      const campo = fields.find((field) => row[field] === horario);
      return {
        status: "registrado",
        data,
        horario,
        campo,
        entrada: row.entrada ?? null,
        ida_intervalo: row.ida_intervalo ?? null,
        volta_intervalo: row.volta_intervalo ?? null,
        saida: row.saida ?? null,
      };
    }

    const current = await query(${JSON.stringify(READ_DAY_SQL)}, [data]);
    if (current.length === 0) {
      return { status: "nao_confirmado", data, horario };
    }

    const row = current[0];
    const values = [row.entrada, row.ida_intervalo, row.volta_intervalo, row.saida];
    if (values.includes(horario)) {
      return { status: "duplicado", data, horario };
    }

    if (saturday) {
      if (row.ida_intervalo != null || row.volta_intervalo != null) {
        return { status: "conflito", motivo: "sabado_com_intervalo", data };
      }
      if (row.entrada != null && row.saida != null) {
        return { status: "completo", data };
      }
      return { status: "conflito", motivo: "ordem_invalida", data };
    }

    if (
      row.entrada != null &&
      row.ida_intervalo != null &&
      row.volta_intervalo != null &&
      row.saida != null
    ) {
      return { status: "completo", data };
    }

    return { status: "conflito", motivo: "ordem_invalida", data };
  }`;
}
function buildPontoHojeCode(databaseId, data) {
  return `async () => {
    ${d1RequestHelper(databaseId)}
    const data = ${JSON.stringify(data)};
    const rows = await query(${JSON.stringify(TODAY_SUMMARY_SQL)}, [data]);
    if (rows.length === 0) return { status: "sem_registro", data };

    const row = rows[0];
    return {
      status: row.status ?? "incompleto",
      data: row.data ?? data,
      entrada: row.entrada ?? null,
      ida_intervalo: row.ida_intervalo ?? null,
      volta_intervalo: row.volta_intervalo ?? null,
      saida: row.saida ?? null,
      carga_minutos: row.carga_minutos ?? null,
      trabalhado_minutos: row.trabalhado_minutos ?? null,
      saldo_minutos: row.saldo_final_minutos ?? null,
    };
  }`;
}
function buildPontoResumoCode(databaseId) {
  return `async () => {
    ${d1RequestHelper(databaseId)}
    const rows = await query(${JSON.stringify(BANK_SUMMARY_SQL)});
    if (rows.length === 0) return { status: "sem_resumo" };

    const row = rows[0];
    return {
      status: "ok",
      dias_trabalhados: row.dias_trabalhados ?? 0,
      horas_trabalhadas: row.horas_trabalhadas ?? null,
      banco_horas: row.banco_horas ?? null,
    };
  }`;
}

const PERIODO_SUMMARY_SQL = `
SELECT data, entrada, ida_intervalo, volta_intervalo, saida,
  carga_minutos, trabalhado_minutos, saldo_final_minutos, status
FROM banco_horas
WHERE (substr(data, 7, 4) || '-' || substr(data, 4, 2) || '-' || substr(data, 1, 2))
  BETWEEN ?1 AND ?2
ORDER BY substr(data, 7, 4), substr(data, 4, 2), substr(data, 1, 2)
LIMIT 94;
`.trim();

function normalizePontoData(raw) {
  if (typeof raw !== "string") return undefined;
  const match = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(raw.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return undefined;
  return { data: `${day}/${month}/${year}`, iso: `${year}-${month}-${day}` };
}

function buildPontoPeriodoCode(databaseId, inicio, fim) {
  return `async () => {
    ${d1RequestHelper(databaseId)}
    const rows = await query(${JSON.stringify(PERIODO_SUMMARY_SQL)}, [${JSON.stringify(inicio)}, ${JSON.stringify(fim)}]);
    return { status: "ok", inicio: ${JSON.stringify(inicio)}, fim: ${JSON.stringify(fim)}, total: rows.length, registros: rows };
  }`;
}

export {
  PONTO_TOOL_CATALOG,
  buildPontoPeriodoCode,
  normalizePontoData,
  buildPontoHojeCode,
  buildPontoRegistrarCode,
  buildPontoResumoCode,
  currentPontoLocalDate,
  normalizePontoHorario
};
