import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  buildPontoRegistrarCode,
  buildPontoHojeCode,
  buildPontoResumoCode,
} from "../src/mcps/ponto/tools.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE pontos (
      data TEXT PRIMARY KEY,
      entrada TEXT,
      ida_intervalo TEXT,
      volta_intervalo TEXT,
      saida TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE VIEW banco_horas AS
      SELECT data, entrada, ida_intervalo, volta_intervalo, saida,
        CASE WHEN substr(data,1,2) = '10' THEN 240 ELSE 480 END AS carga_minutos,
        CASE WHEN saida IS NOT NULL THEN 240 ELSE NULL END AS trabalhado_minutos,
        CASE WHEN saida IS NOT NULL THEN 0 ELSE NULL END AS saldo_final_minutos,
        CASE WHEN saida IS NOT NULL THEN 'completo' ELSE 'incompleto' END AS status
      FROM pontos;
    CREATE VIEW resumo AS SELECT
      COUNT(*) AS dias_trabalhados,
      '4h00' AS horas_trabalhadas,
      '0h00' AS banco_horas
      FROM pontos WHERE saida IS NOT NULL;
  `);
  const cloudflare = {
    async request({
      method, path, body,
    }: { method: string; path: string; body: { sql: string; params?: unknown[] } }) {
      assert.equal(method, "POST");
      assert.equal(path, "/accounts/account-test/d1/database/db-test/query");
      const statement = db.prepare(body.sql);
      const rows = statement.all(...(body.params ?? []) as (string | number | null)[]);
      return { result: [{ success: true, results: rows }] };
    },
  };
  const execute = async (code: string) => {
    const runner = new Function("cloudflare", "accountId", `return (${code})();`) as
      (cloudflare: unknown, accountId: string) => Promise<Record<string, unknown>>;
    return runner(cloudflare, "account-test");
  };
  const register = (data: string, horario: string, saturday = false) =>
    execute(buildPontoRegistrarCode("db-test", data, horario, saturday));
  const read = (data: string) =>
    db.prepare("SELECT * FROM pontos WHERE data = ?").get(data) as
      Record<string, unknown> | undefined;
  return { db, register, read, execute };
}

test("weekday: atomic four punches, duplicate and completed day", async () => {
  const fixtureDb = fixture();
  try {
    const data = "09/10/2026";
    for (const [time, field] of [
      ["06:51", "entrada"], ["10:34", "ida_intervalo"],
      ["12:35", "volta_intervalo"], ["17:03", "saida"],
    ]) {
      const result = await fixtureDb.register(data, time);
      assert.equal(result.status, "registrado");
      assert.equal(result.campo, field);
    }
    const before = fixtureDb.read(data);
    assert.equal((await fixtureDb.register(data, "17:03")).status, "duplicado");
    assert.equal((await fixtureDb.register(data, "18:00")).status, "completo");
    assert.deepEqual(fixtureDb.read(data), before);
  } finally {
    fixtureDb.db.close();
  }
});

test("Saturday: only entry and exit, no phantom intervals", async () => {
  const fixtureDb = fixture();
  try {
    const data = "10/10/2026";
    assert.equal((await fixtureDb.register(data, "06:48", true)).campo, "entrada");
    assert.equal((await fixtureDb.register(data, "11:11", true)).campo, "saida");
    const row = fixtureDb.read(data)!;
    assert.equal(row.ida_intervalo, null);
    assert.equal(row.volta_intervalo, null);
    assert.equal((await fixtureDb.register(data, "12:30", true)).status, "completo");
  } finally {
    fixtureDb.db.close();
  }
});

test("chronology and incompatible partial rows are never overwritten", async () => {
  const fixtureDb = fixture();
  try {
    const data = "09/10/2026";
    await fixtureDb.register(data, "09:00");
    assert.equal((await fixtureDb.register(data, "08:59")).status, "conflito");
    assert.equal(fixtureDb.read(data)?.ida_intervalo, null);
    fixtureDb.db.prepare(
      "UPDATE pontos SET ida_intervalo = '08:00' WHERE data = ?"
    ).run(data);
    assert.equal((await fixtureDb.register(data, "12:00")).status, "conflito");
    assert.equal(fixtureDb.read(data)?.volta_intervalo, null);

    fixtureDb.db.prepare(
      "INSERT INTO pontos(data,entrada,ida_intervalo) VALUES ('10/10/2026','06:48','10:30')"
    ).run();
    assert.equal((await fixtureDb.register("10/10/2026", "11:11", true)).status, "conflito");
    assert.equal(fixtureDb.read("10/10/2026")?.saida, null);
  } finally {
    fixtureDb.db.close();
  }
});

test("simultaneous requests for identical time cannot advance twice", async () => {
  const fixtureDb = fixture();
  try {
    const results = await Promise.all([
      fixtureDb.register("09/10/2026", "06:51"),
      fixtureDb.register("09/10/2026", "06:51"),
    ]);
    assert.deepEqual(results.map(x => x.status).sort(), ["duplicado", "registrado"]);
    const row = fixtureDb.read("09/10/2026")!;
    assert.equal(row.entrada, "06:51");
    assert.equal(row.ida_intervalo, null);
  } finally {
    fixtureDb.db.close();
  }
});

test("read tools use the expected D1 result contracts", async () => {
  const fixtureDb = fixture();
  try {
    assert.equal(
      (await fixtureDb.execute(buildPontoHojeCode("db-test", "09/10/2026"))).status,
      "sem_registro",
    );
    await fixtureDb.register("09/10/2026", "06:51");
    const today = await fixtureDb.execute(buildPontoHojeCode("db-test", "09/10/2026"));
    assert.equal(today.entrada, "06:51");
    assert.equal(today.status, "incompleto");
    const bank = await fixtureDb.execute(buildPontoResumoCode("db-test"));
    assert.equal(bank.status, "ok");
  } finally {
    fixtureDb.db.close();
  }
});
