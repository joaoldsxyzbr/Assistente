import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  buildGastosCode,
  GASTOS_TOOL_CATALOG,
  moneyToCents,
  centsToStored,
  prepareGastosAction,
  resolveGastosPeriodo
} from "../mcps/gastos/tools.js";
const now = /* @__PURE__ */ new Date("2026-10-07T15:00:00Z");
function make(tool, args = {}) {
  const p = prepareGastosAction(tool, args, now);
  assert.ok("action" in p, JSON.stringify(p));
  return p.action;
}
function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE movimentacoes_11_2026 (id INTEGER PRIMARY KEY AUTOINCREMENT,descricao TEXT NOT NULL,tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),categoria TEXT,valor TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pago','pendente')),observacao TEXT)");
  const remote = {
    async request(req) {
      assert.equal(req.method, "POST");
      assert.equal(req.path, "/accounts/test/d1/database/db-test/query");
      return { result: [{ success: true, results: db.prepare(req.body.sql).all(
        ...req.body.params ?? []
      ) }] };
    }
  };
  async function call(name, args = {}) {
    const code = buildGastosCode("db-test", make(name, args));
    const fn = new Function("cloudflare", "accountId", "return (" + code + ")()");
    return fn(remote, "test");
  }
  return { db, call };
}
test("cinco ferramentas com escopo correto", () => {
  assert.deepEqual(GASTOS_TOOL_CATALOG.map((x) => [x.name, x.isWrite]), [
    ["gastos_resumo", false],
    ["gastos_listar", false],
    ["gastos_registrar", true],
    ["gastos_atualizar", true],
    ["gastos_excluir", true]
  ]);
});
test("pr\xF3ximo m\xEAs como padr\xE3o, dezembro vira janeiro", () => {
  assert.deepEqual(
    resolveGastosPeriodo(void 0, now),
    { periodo: "11/2026", tabela: "movimentacoes_11_2026" }
  );
  assert.deepEqual(
    resolveGastosPeriodo(void 0, /* @__PURE__ */ new Date("2026-12-31T15:00:00Z")),
    { periodo: "01/2027", tabela: "movimentacoes_01_2027" }
  );
  assert.equal(resolveGastosPeriodo("13/2026", now), void 0);
  assert.equal(make("gastos_resumo", { periodo: "10/2026" }).periodo, "10/2026");
});
test("convers\xE3o de TEXT para centavos sem usar ponto flutuante monet\xE1rio", () => {
  for (const [raw, cents] of [
    ["0", 0],
    ["1234.56", 123456],
    ["R$ 1.234,56", 123456],
    ["1234,5", 123450],
    ["100", 1e4],
    ["1.234", 123400]
  ]) {
    assert.equal(moneyToCents(raw), cents, raw);
  }
  for (const raw of ["-4,00", "12.3456", "1,234.56", "1.23.4", "NaN", ""]) {
    assert.equal(moneyToCents(raw), void 0, raw);
  }
  assert.equal(centsToStored(123456), "1234.56");
});
test("valida ID, campos e valor antes de enviar D1", () => {
  for (const result of [
    prepareGastosAction("gastos_registrar", { descricao: "X", valor: "12,345", tipo: "saida" }, now),
    prepareGastosAction("gastos_atualizar", { busca: "X" }, now),
    prepareGastosAction("gastos_excluir", { id: 0 }, now)
  ]) assert.ok("error" in result);
});
test("registrar, listar, resumir, pagar, editar e excluir com D1 sint\xE9tico", async () => {
  const f = setup();
  try {
    const a = await f.call("gastos_registrar", { descricao: "Energia", valor: "R$ 130,20", tipo: "saida" });
    assert.equal(a.status, "registrado");
    const item = a.item;
    assert.equal(item.status, "pendente");
    assert.equal(item.valor, "130.20");
    const id = item.id;
    assert.equal((await f.call("gastos_registrar", { descricao: "Entrada", valor: "5000,00", tipo: "entrada" })).status, "registrado");
    const summary = await f.call("gastos_resumo");
    assert.equal(summary.entradas_centavos, 5e5);
    assert.equal(summary.saidas_centavos, 13020);
    assert.equal(summary.saldo_centavos, 486980);
    assert.equal(summary.pendentes_centavos, 13020);
    assert.equal((await f.call("gastos_listar", { status: "pendente", tipo: "saida" })).quantidade, 1);
    const edited = await f.call("gastos_atualizar", { id, novo_status: "pago", novo_valor: "135,99" });
    assert.equal(edited.status, "atualizado");
    assert.equal(edited.item.valor, "135.99");
    assert.equal((await f.call("gastos_resumo")).pendentes_centavos, 0);
    assert.equal((await f.call("gastos_excluir", { id })).status, "excluido");
    assert.equal((await f.call("gastos_listar", { tipo: "saida" })).quantidade, 0);
  } finally {
    f.db.close();
  }
});
test("duplicata e nomes amb\xEDguos n\xE3o causam altera\xE7\xE3o", async () => {
  const f = setup();
  try {
    const x = { descricao: "\xC1gua", valor: "10,00", tipo: "saida" };
    assert.equal((await f.call("gastos_registrar", x)).status, "registrado");
    assert.equal((await f.call("gastos_registrar", { ...x, valor: "10.00" })).status, "duplicado");
    assert.equal((await f.call("gastos_listar")).quantidade, 1);
    assert.equal((await f.call("gastos_registrar", { ...x, permitir_duplicado: true })).status, "registrado");
    assert.equal((await f.call("gastos_atualizar", { busca: "\xC1gua", novo_status: "pago" })).status, "ambiguo");
    assert.equal((await f.call("gastos_excluir", { descricao: "\xC1gua" })).status, "ambiguo");
    assert.equal((await f.call("gastos_listar")).quantidade, 2);
  } finally {
    f.db.close();
  }
});
test("valor inv\xE1lido em tabela n\xE3o pode gerar totais falsos", async () => {
  const f = setup();
  try {
    f.db.prepare("INSERT INTO movimentacoes_11_2026(descricao,tipo,valor) VALUES ('Legado','saida','??')").run();
    const r = await f.call("gastos_resumo");
    assert.equal(r.status, "inconsistente");
    assert.deepEqual(r.ids_invalidos, [1]);
    assert.equal(r.saldo, void 0);
  } finally {
    f.db.close();
  }
});
test("consulta n\xE3o cria m\xEAs ausente; registro autorizado copia s\xF3 o schema", async () => {
  const f = setup();
  try {
    assert.equal((await f.call("gastos_resumo", { periodo: "12/2026" })).status, "tabela_ausente");
    assert.equal((await f.call("gastos_registrar", { periodo: "12/2026", descricao: "Teste", valor: "1,00", tipo: "saida" })).status, "registrado");
    assert.equal((await f.call("gastos_listar", { periodo: "12/2026" })).quantidade, 1);
    assert.equal((await f.call("gastos_listar")).quantidade, 0);
  } finally {
    f.db.close();
  }
});
test("inexist\xEAncia n\xE3o permite apagar ou editar", async () => {
  const f = setup();
  try {
    assert.equal((await f.call("gastos_atualizar", { busca: "Inexistente", novo_status: "pago" })).status, "nao_encontrado");
    assert.equal((await f.call("gastos_excluir", { descricao: "Inexistente" })).status, "nao_encontrado");
  } finally {
    f.db.close();
  }
});

test("registro concorrente normalizado evita duplicatas, inclusive com letras acentuadas", async () => {
  const f = setup();
  try {
    const results = await Promise.all([
      f.call("gastos_registrar", { descricao: "ÁGUA", valor: "10,00", tipo: "saida" }),
      f.call("gastos_registrar", { descricao: "água", valor: "10.00", tipo: "saida" })
    ]);
    assert.deepEqual(results.map(r => r.status).sort(), ["duplicado", "registrado"]);
    assert.equal((await f.call("gastos_listar")).quantidade, 1);
  } finally { f.db.close(); }
});
test("copia esquema do mês mais recente de verdade, não ordem alfabética", async () => {
  const f = setup();
  try {
    f.db.exec("CREATE TABLE movimentacoes_12_2026 (id INTEGER PRIMARY KEY AUTOINCREMENT,descricao TEXT NOT NULL,tipo TEXT NOT NULL,categoria TEXT DEFAULT 'antigo',valor TEXT NOT NULL,status TEXT NOT NULL,observacao TEXT)");
    f.db.exec("CREATE TABLE movimentacoes_01_2027 (id INTEGER PRIMARY KEY AUTOINCREMENT,descricao TEXT NOT NULL,tipo TEXT NOT NULL,categoria TEXT DEFAULT 'recente',valor TEXT NOT NULL,status TEXT NOT NULL,observacao TEXT)");
    const r = await f.call("gastos_registrar", { periodo: "02/2027", descricao: "Teste", valor: "1.00", tipo: "saida" });
    assert.equal(r.status, "registrado");
    const row = f.db.prepare("SELECT sql FROM sqlite_master WHERE name='movimentacoes_02_2027'").get();
    assert.match(row.sql, /recente/);
  } finally { f.db.close(); }
});
