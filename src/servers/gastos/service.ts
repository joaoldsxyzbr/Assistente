import type { D1Database } from "../../shared/d1.ts";
import { DomainOperationError } from "../../shared/errors.ts";

export type ExpenseType = "entrada" | "saida";
export type ExpenseStatus = "pago" | "pendente";

export interface ExpenseRow {
  id: number;
  descricao: string;
  tipo: ExpenseType;
  categoria: string | null;
  valor: string;
  status: ExpenseStatus;
  observacao: string | null;
}

export interface MoneyValue {
  cents: bigint;
  canonical: string;
}

const EXPENSE_COLUMNS =
  "id, descricao, tipo, categoria, valor, status, observacao";

export function isValidMonth(value: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
}

export function nextMonthInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  let year = Number(value.year);
  let month = Number(value.month) + 1;
  if (month === 13) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function resolveExpenseMonth(month?: string): string {
  const resolved = month ?? nextMonthInSaoPaulo();
  if (!isValidMonth(resolved)) {
    throw new DomainOperationError(
      "INVALID_MONTH",
      "Informe o mês no formato AAAA-MM.",
    );
  }
  return resolved;
}

export function monthlyTableName(month: string): string {
  if (!isValidMonth(month)) {
    throw new DomainOperationError("INVALID_MONTH", "Mês inválido.");
  }
  const [year, numericMonth] = month.split("-");
  return `movimentacoes_${numericMonth}_${year}`;
}

export function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function normalizeExpenseDescription(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > 200) {
    throw new DomainOperationError(
      "INVALID_DESCRIPTION",
      "A descrição precisa ter entre 1 e 200 caracteres.",
    );
  }
  return normalized;
}

export function parseMoneyToCents(value: string): MoneyValue {
  let normalized = value.trim();
  if (/^R\$/i.test(normalized)) {
    normalized = normalized.replace(/^R\$\s*/i, "");
  }

  let whole: string;
  let fraction: string;
  if (normalized.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) {
      throw new DomainOperationError(
        "INVALID_AMOUNT",
        "Valor inválido. Use 1234,56, 1.234,56 ou 1234.56, com até duas casas decimais.",
      );
    }
    const [integerPart, decimalPart = ""] = normalized.split(",");
    whole = integerPart.replaceAll(".", "");
    fraction = decimalPart;
  } else {
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new DomainOperationError(
        "INVALID_AMOUNT",
        "Valor inválido. Use 1234,56, 1.234,56 ou 1234.56, com até duas casas decimais.",
      );
    }
    const [integerPart, decimalPart = ""] = normalized.split(".");
    whole = integerPart;
    fraction = decimalPart;
  }

  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainOperationError("AMOUNT_TOO_LARGE", "Valor acima do limite permitido.");
  }

  return { cents, canonical: formatCentsCanonical(cents) };
}

export function tryParseMoneyToCents(value: string): bigint | undefined {
  try {
    return parseMoneyToCents(value).cents;
  } catch {
    return undefined;
  }
}

export function formatCentsCanonical(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function formatCentsBRL(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${whole},${fraction}`;
}

async function requireMonthlyTable(
  db: D1Database,
  month: string,
): Promise<string> {
  const table = monthlyTableName(month);
  const exists = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(table)
    .first<{ name: string }>();
  if (exists === null) {
    throw new DomainOperationError(
      "MONTH_TABLE_MISSING",
      `A tabela de ${month} não existe no D1. Nenhum dado ou schema foi criado.`,
    );
  }
  return table;
}

export async function listExpenses(
  db: D1Database,
  input: {
    mes?: string;
    tipo?: ExpenseType;
    status?: ExpenseStatus;
    limite?: number;
    deslocamento?: number;
  },
): Promise<{
  mes: string;
  movimentacoes: ExpenseRow[];
  limite: number;
  deslocamento: number;
  temMais: boolean;
}> {
  const month = resolveExpenseMonth(input.mes);
  const table = await requireMonthlyTable(db, month);
  const limit = input.limite ?? 100;
  const offset = input.deslocamento ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new DomainOperationError("INVALID_LIMIT", "Limite inválido.");
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) {
    throw new DomainOperationError("INVALID_OFFSET", "Deslocamento inválido.");
  }

  const predicates: string[] = [];
  const params: unknown[] = [];
  if (input.tipo !== undefined) {
    predicates.push("tipo = ?");
    params.push(input.tipo);
  }
  if (input.status !== undefined) {
    predicates.push("status = ?");
    params.push(input.status);
  }
  const where = predicates.length > 0 ? ` WHERE ${predicates.join(" AND ")}` : "";
  params.push(limit + 1, offset);

  const result = await db
    .prepare(
      `SELECT ${EXPENSE_COLUMNS} FROM ${table}${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params)
    .all<ExpenseRow>();
  const records = result.results ?? [];
  return {
    mes: month,
    movimentacoes: records.slice(0, limit),
    limite: limit,
    deslocamento: offset,
    temMais: records.length > limit,
  };
}

export async function summarizeExpenses(
  db: D1Database,
  mes?: string,
): Promise<{
  mes: string;
  quantidade: number;
  entradas: string;
  saidas: string;
  saldo: string;
}> {
  const month = resolveExpenseMonth(mes);
  const table = await requireMonthlyTable(db, month);
  const result = await db
    .prepare(`SELECT ${EXPENSE_COLUMNS} FROM ${table} ORDER BY id ASC LIMIT ?`)
    .bind(5001)
    .all<ExpenseRow>();
  const rows = result.results ?? [];
  if (rows.length > 5000) {
    throw new DomainOperationError(
      "SUMMARY_LIMIT_EXCEEDED",
      "O mês tem mais de 5.000 lançamentos; o resumo integral não foi confirmado.",
    );
  }

  let incomes = 0n;
  let expenses = 0n;
  const invalidValues: number[] = [];
  for (const row of rows) {
    const cents = tryParseMoneyToCents(row.valor);
    if (cents === undefined || (row.tipo !== "entrada" && row.tipo !== "saida")) {
      invalidValues.push(row.id);
      continue;
    }
    if (row.tipo === "entrada") incomes += cents;
    else expenses += cents;
  }
  if (invalidValues.length > 0) {
    throw new DomainOperationError(
      "INVALID_STORED_AMOUNTS",
      `O resumo de ${month} não foi confirmado. Revise os valores dos lançamentos ID ${invalidValues.join(", ")}.`,
    );
  }

  return {
    mes: month,
    quantidade: rows.length,
    entradas: formatCentsBRL(incomes),
    saidas: formatCentsBRL(expenses),
    saldo: formatCentsBRL(incomes - expenses),
  };
}

export interface RegisterExpenseInput {
  mes?: string;
  descricao: string;
  valor: string;
  tipo: ExpenseType;
  categoria?: string;
  status?: ExpenseStatus;
  confirmarDuplicata?: boolean;
}

export async function registerExpense(
  db: D1Database,
  input: RegisterExpenseInput,
): Promise<{
  status: "registrado" | "confirmacao_necessaria" | "resultado_incerto";
  mes: string;
  registro?: ExpenseRow;
  duplicatas?: Array<Pick<ExpenseRow, "id" | "descricao" | "tipo" | "valor" | "status">>;
}> {
  const month = resolveExpenseMonth(input.mes);
  const table = await requireMonthlyTable(db, month);
  const description = normalizeExpenseDescription(input.descricao);
  const money = parseMoneyToCents(input.valor);
  if (input.tipo !== "entrada" && input.tipo !== "saida") {
    throw new DomainOperationError("INVALID_TYPE", "Tipo precisa ser entrada ou saida.");
  }
  if (input.status !== undefined && input.status !== "pago" && input.status !== "pendente") {
    throw new DomainOperationError("INVALID_STATUS", "Status inválido.");
  }

  const possibleDuplicates = await db
    .prepare(`SELECT ${EXPENSE_COLUMNS} FROM ${table} WHERE tipo = ? ORDER BY id DESC LIMIT ?`)
    .bind(input.tipo, 5001)
    .all<ExpenseRow>();
  const candidates = possibleDuplicates.results ?? [];
  if (candidates.length > 5000) {
    throw new DomainOperationError(
      "DUPLICATE_SEARCH_INCOMPLETE",
      "A verificação de duplicidade excedeu 5.000 registros. Nenhum lançamento foi gravado.",
    );
  }

  const duplicates = candidates.filter((row) => {
    if (normalizeDescription(row.descricao) !== normalizeDescription(description)) return false;
    const currentCents = tryParseMoneyToCents(row.valor);
    return currentCents === undefined || currentCents === money.cents;
  });
  if (duplicates.length > 0 && input.confirmarDuplicata !== true) {
    return {
      status: "confirmacao_necessaria",
      mes: month,
      duplicatas: duplicates.map(({ id, descricao: label, tipo, valor, status }) => ({
        id,
        descricao: label,
        tipo,
        valor,
        status,
      })),
    };
  }

  const category = input.categoria?.trim() || undefined;
  const columns = ["descricao", "tipo", "valor"];
  const values: unknown[] = [description, input.tipo, money.canonical];
  if (category !== undefined) {
    columns.push("categoria");
    values.push(category);
  }
  if (input.status !== undefined) {
    columns.push("status");
    values.push(input.status);
  }
  const placeholders = columns.map(() => "?").join(", ");
  const record = await db
    .prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING ${EXPENSE_COLUMNS}`,
    )
    .bind(...values)
    .first<ExpenseRow>();
  if (record === null) return { status: "resultado_incerto", mes: month };
  const verified = await db
    .prepare(`SELECT ${EXPENSE_COLUMNS} FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(record.id)
    .first<ExpenseRow>();
  if (verified === null) return { status: "resultado_incerto", mes: month };
  return { status: "registrado", mes: month, registro: verified };
}

export interface EditExpenseInput {
  mes: string;
  id: number;
  descricao?: string;
  valor?: string;
  tipo?: ExpenseType;
  categoria?: string | null;
  status?: ExpenseStatus;
}

export async function editExpense(
  db: D1Database,
  input: EditExpenseInput,
): Promise<{ status: "atualizado" | "nao_encontrado"; mes: string; registro?: ExpenseRow }> {
  const month = resolveExpenseMonth(input.mes);
  const table = await requireMonthlyTable(db, month);
  if (!Number.isInteger(input.id) || input.id < 1) {
    throw new DomainOperationError("INVALID_ID", "ID do lançamento inválido.");
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.descricao !== undefined) {
    fields.push("descricao = ?");
    values.push(normalizeExpenseDescription(input.descricao));
  }
  if (input.valor !== undefined) {
    fields.push("valor = ?");
    values.push(parseMoneyToCents(input.valor).canonical);
  }
  if (input.tipo !== undefined) {
    if (input.tipo !== "entrada" && input.tipo !== "saida") {
      throw new DomainOperationError("INVALID_TYPE", "Tipo inválido.");
    }
    fields.push("tipo = ?");
    values.push(input.tipo);
  }
  if (input.categoria !== undefined) {
    const category = input.categoria?.trim() || null;
    if (category !== null && category.length > 100) {
      throw new DomainOperationError("INVALID_CATEGORY", "Categoria acima de 100 caracteres.");
    }
    fields.push("categoria = ?");
    values.push(category);
  }
  if (input.status !== undefined) {
    if (input.status !== "pago" && input.status !== "pendente") {
      throw new DomainOperationError("INVALID_STATUS", "Status inválido.");
    }
    fields.push("status = ?");
    values.push(input.status);
  }
  if (fields.length === 0) {
    throw new DomainOperationError("NO_FIELDS", "Informe ao menos um campo para editar.");
  }

  values.push(input.id);
  const record = await db
    .prepare(`UPDATE ${table} SET ${fields.join(", ")} WHERE id = ? RETURNING ${EXPENSE_COLUMNS}`)
    .bind(...values)
    .first<ExpenseRow>();
  if (record === null) return { status: "nao_encontrado", mes: month };
  const verified = await db
    .prepare(`SELECT ${EXPENSE_COLUMNS} FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(record.id)
    .first<ExpenseRow>();
  return verified === null
    ? { status: "nao_encontrado", mes: month }
    : { status: "atualizado", mes: month, registro: verified };
}

export async function setExpenseStatus(
  db: D1Database,
  input: { mes: string; id: number; status: ExpenseStatus },
): Promise<{ status: "atualizado" | "nao_encontrado"; mes: string; registro?: ExpenseRow }> {
  return editExpense(db, input);
}

export async function deleteExpense(
  db: D1Database,
  input: { mes: string; id: number; confirmar: boolean },
): Promise<{ status: "excluido" | "nao_encontrado"; mes: string; registro?: ExpenseRow }> {
  const month = resolveExpenseMonth(input.mes);
  const table = await requireMonthlyTable(db, month);
  if (!Number.isInteger(input.id) || input.id < 1) {
    throw new DomainOperationError("INVALID_ID", "ID do lançamento inválido.");
  }
  if (input.confirmar !== true) {
    throw new DomainOperationError(
      "CONFIRMATION_REQUIRED",
      "A exclusão exige pedido explícito do usuário.",
    );
  }
  const record = await db
    .prepare(`DELETE FROM ${table} WHERE id = ? RETURNING ${EXPENSE_COLUMNS}`)
    .bind(input.id)
    .first<ExpenseRow>();
  if (record === null) return { status: "nao_encontrado", mes: month };
  const stillExists = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<{ id: number }>();
  if (stillExists !== null) {
    throw new DomainOperationError(
      "DELETE_NOT_CONFIRMED",
      "O D1 ainda retorna esse ID; a exclusão não foi confirmada.",
    );
  }
  return { status: "excluido", mes: month, registro: record };
}
