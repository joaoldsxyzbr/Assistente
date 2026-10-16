import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
const point = await readFile(
  new URL("../skills/ponto/SQL.md", import.meta.url),
  "utf8",
);
const expenses = await readFile(
  new URL("../skills/gastos/EXECUCAO.md", import.meta.url),
  "utf8",
);
function pointSql(name) {
  return point
    .split("### " + name)[1]
    .split("```sql\n")[1]
    .split("```")[0];
}
test("Ponto weekday SQL advances sequentially, rejects duplicate/out-of-order times and preserves a full day", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE pontos(data TEXT UNIQUE,entrada TEXT,ida_intervalo TEXT,volta_intervalo TEXT,saida TEXT,atualizado_em TEXT)",
    );
    const stmt = db.prepare(pointSql("WEEKDAY_REGISTER_SQL"));
    for (const hour of ["08:00", "12:00", "13:00", "18:00"])
      assert.equal(stmt.all("16/10/2026", hour).length, 1);
    for (const hour of ["08:00", "07:00", "19:00"])
      assert.equal(stmt.all("16/10/2026", hour).length, 0);
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT entrada,ida_intervalo,volta_intervalo,saida FROM pontos",
          )
          .get(),
      },
      {
        entrada: "08:00",
        ida_intervalo: "12:00",
        volta_intervalo: "13:00",
        saida: "18:00",
      },
    );
  } finally {
    db.close();
  }
});
test("Ponto Saturday SQL records entry and exit without inventing a break", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE pontos(data TEXT UNIQUE,entrada TEXT,ida_intervalo TEXT,volta_intervalo TEXT,saida TEXT,atualizado_em TEXT)",
    );
    const stmt = db.prepare(pointSql("SATURDAY_REGISTER_SQL"));
    assert.equal(stmt.all("17/10/2026", "08:00").length, 1);
    assert.equal(stmt.all("17/10/2026", "07:00").length, 0);
    assert.equal(stmt.all("17/10/2026", "12:00").length, 1);
    assert.equal(
      db.prepare("SELECT ida_intervalo FROM pontos").get().ida_intervalo,
      null,
    );
  } finally {
    db.close();
  }
});
test("Gastos atomic duplicate check normalizes whitespace if a competing write occurs after precheck", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE movimentacoes_11_2026 (id INTEGER PRIMARY KEY,descricao TEXT,tipo TEXT,categoria TEXT,valor TEXT,status TEXT,observacao TEXT)",
    );
    const source = expenses
      .split("```js\n")[1]
      .split("```")[0]
      .replace(/const input = .*?;\n/, "const input = supplied;\n");
    const execute = new (Object.getPrototypeOf(
      async function () {},
    ).constructor)(
      "cloudflare",
      "accountId",
      "supplied",
      "return (" + source + ")()",
    );
    let inserted = false;
    const cloudflare = {
      request: async ({ body }) => {
        const rows = db.prepare(body.sql).all(...body.params);
        if (
          !inserted &&
          body.sql.startsWith("SELECT id, descricao") &&
          !body.sql.includes("WHERE")
        ) {
          inserted = true;
          db.prepare(
            "INSERT INTO movimentacoes_11_2026 VALUES(1,?,?,?,?,?,?)",
          ).run(
            "Almoço\t\u00a0 de sexta",
            "saida",
            "Alimentação",
            "25.00",
            "pago",
            "",
          );
        }
        return { success: true, result: [{ success: true, results: rows }] };
      },
    };
    const result = await execute(cloudflare, "test-account", {
      operacao: "registrar",
      periodo: "11/2026",
      tabela: "movimentacoes_11_2026",
      descricao: "Almoço de sexta",
      tipo: "saida",
      categoria: "Alimentação",
      valor: "25.00",
      status: "pago",
      observacao: "",
    });
    assert.equal(result.status, "duplicado");
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM movimentacoes_11_2026").get().n,
      1,
    );
  } finally {
    db.close();
  }
});
