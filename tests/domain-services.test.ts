import assert from "node:assert/strict";
import test from "node:test";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/shared/d1.ts";
import {
  choosePunchField,
  registerHourAdjustment,
  registerPunch,
  type AjusteBancoHorasRow,
  type PontoRow,
} from "../src/servers/ponto/service.ts";
import {
  formatCentsBRL,
  monthlyTableName,
  nextMonthInSaoPaulo,
  parseMoneyToCents,
  registerExpense,
  summarizeExpenses,
  deleteExpense,
  type ExpenseRow,
} from "../src/servers/gastos/service.ts";

class MemoryD1 implements D1Database {
  readonly ponto = new Map<string, PontoRow>();
  readonly tables = new Set<string>();
  readonly expenses = new Map<string, ExpenseRow[]>();
  readonly adjustments: AjusteBancoHorasRow[] = [];
  writes = 0;

  prepare(query: string): D1PreparedStatement {
    return new MemoryStatement(this, query);
  }

  execute(query: string, values: unknown[]): {
    first?: unknown;
    results?: unknown[];
    changes?: number;
  } {
    if (query.startsWith("SELECT name FROM sqlite_master")) {
      const name = String(values[0]);
      return this.tables.has(name) ? { first: { name } } : {};
    }

    if (query.includes("FROM pontos WHERE data = ?")) {
      return { first: this.ponto.get(String(values[0])) ?? null };
    }

    if (query.includes("FROM ajustes_banco_horas WHERE data = ?")) {
      const date = String(values[0]);
      return {
        results: this.adjustments
          .filter((adjustment) => adjustment.data === date)
          .slice(0, Number(values[1])),
      };
    }

    if (query.startsWith("INSERT INTO ajustes_banco_horas")) {
      const [date, minutes, reason] = values;
      const row: AjusteBancoHorasRow = {
        id: this.adjustments.reduce((max, current) => Math.max(max, current.id), 0) + 1,
        data: String(date),
        ajuste_minutos: Number(minutes),
        motivo: String(reason),
        criado_em: "2026-10-07 00:00:00",
        atualizado_em: "2026-10-07 00:00:00",
      };
      this.adjustments.push(row);
      this.writes += 1;
      return { first: row };
    }

    if (query.includes("FROM ajustes_banco_horas WHERE id = ?")) {
      const row = this.adjustments.find((adjustment) => adjustment.id === Number(values[0]));
      return { first: row ?? null };
    }

    if (query.startsWith("INSERT INTO pontos")) {
      const data = String(values[0]);
      if (this.ponto.has(data)) return { changes: 0 };
      const field = /\(data, (entrada|ida_intervalo|volta_intervalo|saida)\)/.exec(query)?.[1];
      if (field === undefined) throw new Error("unexpected point insert");
      const row: PontoRow = {
        data,
        entrada: null,
        ida_intervalo: null,
        volta_intervalo: null,
        saida: null,
        [field]: String(values[1]),
      };
      this.ponto.set(data, row);
      this.writes += 1;
      return { changes: 1 };
    }

    if (query.startsWith("UPDATE pontos")) {
      const field = /SET (entrada|ida_intervalo|volta_intervalo|saida) = \?/.exec(query)?.[1];
      if (field === undefined) throw new Error("unexpected point update");
      const [time, data] = values.map(String);
      const row = this.ponto.get(data);
      if (row === undefined || row[field as keyof PontoRow] !== null) return { changes: 0 };
      this.ponto.set(data, { ...row, [field]: time });
      this.writes += 1;
      return { changes: 1 };
    }

    const duplicateSearch = /SELECT .* FROM (movimentacoes_\d{2}_\d{4}) WHERE tipo = \?/.exec(query);
    if (duplicateSearch !== null) {
      const rows = this.expenses.get(duplicateSearch[1]) ?? [];
      const type = String(values[0]);
      const limit = Number(values[1]);
      return { results: rows.filter((row) => row.tipo === type).slice(0, limit) };
    }

    const summary = /SELECT .* FROM (movimentacoes_\d{2}_\d{4}) ORDER BY id ASC LIMIT \?/.exec(query);
    if (summary !== null) {
      return { results: (this.expenses.get(summary[1]) ?? []).slice(0, Number(values[0])) };
    }

    const insert = /INSERT INTO (movimentacoes_\d{2}_\d{4}) \(([^)]+)\) VALUES \(([^)]+)\) RETURNING/.exec(query);
    if (insert !== null) {
      const table = insert[1];
      const columns = insert[2].split(", ");
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]])) as Partial<ExpenseRow>;
      const records = this.expenses.get(table) ?? [];
      const inserted: ExpenseRow = {
        id: records.reduce((max, current) => Math.max(max, current.id), 0) + 1,
        descricao: String(row.descricao),
        tipo: row.tipo as "entrada" | "saida",
        categoria: (row.categoria as string | undefined) ?? null,
        valor: String(row.valor),
        status: (row.status as "pago" | "pendente" | undefined) ?? "pendente",
        observacao: null,
      };
      this.expenses.set(table, [...records, inserted]);
      this.tables.add(table);
      this.writes += 1;
      return { first: inserted };
    }

    const byId = /SELECT .* FROM (movimentacoes_\d{2}_\d{4}) WHERE id = \? LIMIT 1/.exec(query);
    if (byId !== null) {
      const id = Number(values[0]);
      const row = (this.expenses.get(byId[1]) ?? []).find((candidate) => candidate.id === id);
      return { first: row ?? null };
    }

    const deletion = /DELETE FROM (movimentacoes_\d{2}_\d{4}) WHERE id = \? RETURNING/.exec(query);
    if (deletion !== null) {
      const table = deletion[1];
      const id = Number(values[0]);
      const rows = this.expenses.get(table) ?? [];
      const row = rows.find((candidate) => candidate.id === id);
      if (row === undefined) return { first: null };
      this.expenses.set(table, rows.filter((candidate) => candidate.id !== id));
      this.writes += 1;
      return { first: row };
    }

    throw new Error(`Unsupported test query: ${query}`);
  }
}

class MemoryStatement implements D1PreparedStatement {
  private readonly database: MemoryD1;
  private readonly query: string;
  private readonly values: unknown[];

  constructor(
    database: MemoryD1,
    query: string,
    values: unknown[] = [],
  ) {
    this.database = database;
    this.query = query;
    this.values = values;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new MemoryStatement(this.database, this.query, values);
  }

  async first<T>(): Promise<T | null> {
    const result = this.database.execute(this.query, this.values);
    return (result.first as T | null | undefined) ?? null;
  }

  async all<T>(): Promise<D1Result<T>> {
    const result = this.database.execute(this.query, this.values);
    return { results: (result.results ?? []) as T[] };
  }

  async run(): Promise<D1Result<never>> {
    const result = this.database.execute(this.query, this.values);
    return { meta: { changes: result.changes ?? 0 } };
  }
}

test("ponto uses the next empty mark and an identical repeat is a no-op", async () => {
  const db = new MemoryD1();
  db.ponto.set("2026-10-07", {
    data: "2026-10-07",
    entrada: "06:51",
    ida_intervalo: null,
    volta_intervalo: null,
    saida: null,
  });

  assert.equal(choosePunchField(db.ponto.get("2026-10-07")!, undefined), "ida_intervalo");
  const registered = await registerPunch(db, { data: "2026-10-07", horario: "10:34" });
  assert.equal(registered.status, "registrado");
  assert.equal(registered.marcacao, "ida_intervalo");
  assert.equal(db.ponto.get("2026-10-07")?.ida_intervalo, "10:34");

  const writesBeforeRepeat = db.writes;
  const repeated = await registerPunch(db, { data: "2026-10-07", horario: "10:34" });
  assert.equal(repeated.status, "ja_registrado");
  assert.equal(db.writes, writesBeforeRepeat);
});

test("ponto rejects invalid times and never overwrites an occupied mark", async () => {
  const db = new MemoryD1();
  db.ponto.set("2026-10-07", {
    data: "2026-10-07",
    entrada: "06:51",
    ida_intervalo: null,
    volta_intervalo: null,
    saida: null,
  });

  await assert.rejects(
    registerPunch(db, { data: "2026-10-07", horario: "25:90" }),
    /formato HH:MM/,
  );
  const occupied = await registerPunch(db, {
    data: "2026-10-07",
    horario: "07:00",
    marcacao: "entrada",
  });
  assert.equal(occupied.status, "campo_ocupado");
  assert.equal(db.ponto.get("2026-10-07")?.entrada, "06:51");
  assert.equal(db.writes, 0);
});

test("ponto asks before duplicating an identical bank-hours adjustment", async () => {
  const db = new MemoryD1();
  db.adjustments.push({
    id: 4,
    data: "2026-10-07",
    ajuste_minutos: 30,
    motivo: "Ajuste autorizado",
    criado_em: "2026-10-07 00:00:00",
    atualizado_em: "2026-10-07 00:00:00",
  });

  const duplicate = await registerHourAdjustment(db, {
    data: "2026-10-07",
    ajusteMinutos: 30,
    motivo: " ajuste   autorizado ",
  });
  assert.equal(duplicate.status, "confirmacao_necessaria");
  assert.equal(db.writes, 0);

  await assert.rejects(
    registerHourAdjustment(db, { data: "2026-10-07", ajusteMinutos: 0, motivo: "Inválido" }),
    /diferente de zero/,
  );
  const confirmed = await registerHourAdjustment(db, {
    data: "2026-10-07",
    ajusteMinutos: 30,
    motivo: "Ajuste autorizado",
    confirmarDuplicata: true,
  });
  assert.equal(confirmed.status, "registrado");
  assert.equal(db.writes, 1);
});

test("gastos accepts Brazilian and canonical money without floating-point math", () => {
  assert.deepEqual(parseMoneyToCents("R$ 1.234,56"), {
    cents: 123456n,
    canonical: "1234.56",
  });
  assert.equal(parseMoneyToCents("1234.56").cents, 123456n);
  assert.throws(() => parseMoneyToCents("1.234"), /até duas casas/);
  assert.equal(formatCentsBRL(-1n), "-R$ 0,01");
  assert.equal(monthlyTableName("2026-11"), "movimentacoes_11_2026");
  assert.throws(() => monthlyTableName("2026-13"), /Mês inválido/);
});

test("gastos default month advances in São Paulo across the year boundary", () => {
  assert.equal(nextMonthInSaoPaulo(new Date("2026-12-31T23:30:00-03:00")), "2027-01");
});

test("gastos duplicate guard asks before inserting and writes canonical values", async () => {
  const db = new MemoryD1();
  db.tables.add("movimentacoes_11_2026");
  db.expenses.set("movimentacoes_11_2026", [{
    id: 1,
    descricao: "Academia",
    tipo: "saida",
    categoria: null,
    valor: "12.00",
    status: "pendente",
    observacao: null,
  }]);

  const duplicate = await registerExpense(db, {
    mes: "2026-11",
    descricao: "  academia  ",
    valor: "12,00",
    tipo: "saida",
  });
  assert.equal(duplicate.status, "confirmacao_necessaria");
  assert.equal(db.writes, 0);

  const inserted = await registerExpense(db, {
    mes: "2026-11",
    descricao: "Mercado",
    valor: "1.234,56",
    tipo: "saida",
  });
  assert.equal(inserted.status, "registrado");
  assert.equal(inserted.registro?.valor, "1234.56");
  assert.equal(inserted.registro?.status, "pendente");
  assert.equal(db.writes, 1);
});

test("gastos summary totals cents and refuses to create a missing month table", async () => {
  const db = new MemoryD1();
  db.tables.add("movimentacoes_11_2026");
  db.expenses.set("movimentacoes_11_2026", [
    { id: 1, descricao: "Salário", tipo: "entrada", categoria: null, valor: "2000.10", status: "pago", observacao: null },
    { id: 2, descricao: "Conta", tipo: "saida", categoria: null, valor: "1234.56", status: "pendente", observacao: null },
  ]);

  const summary = await summarizeExpenses(db, "2026-11");
  assert.equal(summary.entradas, "R$ 2.000,10");
  assert.equal(summary.saidas, "R$ 1.234,56");
  assert.equal(summary.saldo, "R$ 765,54");

  await assert.rejects(
    registerExpense(db, { mes: "2027-01", descricao: "Teste", valor: "1,00", tipo: "saida" }),
    /Nenhum dado ou schema foi criado/,
  );
  assert.equal(db.tables.has("movimentacoes_01_2027"), false);
  assert.equal(db.writes, 0);
});

test("gastos deletion requires explicit confirmation and targets one ID", async () => {
  const db = new MemoryD1();
  db.tables.add("movimentacoes_11_2026");
  db.expenses.set("movimentacoes_11_2026", [{
    id: 8,
    descricao: "Teste",
    tipo: "saida",
    categoria: null,
    valor: "3.00",
    status: "pendente",
    observacao: null,
  }]);

  await assert.rejects(
    deleteExpense(db, { mes: "2026-11", id: 8, confirmar: false }),
    /pedido explícito/,
  );
  const result = await deleteExpense(db, { mes: "2026-11", id: 8, confirmar: true });
  assert.equal(result.status, "excluido");
  assert.deepEqual(db.expenses.get("movimentacoes_11_2026"), []);
  assert.equal(db.writes, 1);
});
