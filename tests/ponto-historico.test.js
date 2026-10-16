import assert from "node:assert/strict";
import test from "node:test";
import { PONTO_TOOL_CATALOG, normalizePontoData, buildPontoPeriodoCode, buildPontoHojeCode } from "../mcps/ponto/tools.js";

test("consultas historicas sao somente leitura e tem contratos simples", () => {
  assert.deepEqual(PONTO_TOOL_CATALOG.filter(t => ["ponto_data", "ponto_periodo"].includes(t.name)).map(t => [t.name, t.isWrite]), [
    ["ponto_data", false], ["ponto_periodo", false]
  ]);
});

test("validacao de datas nao aceita dias inexistentes nem formatos alternativos", () => {
  assert.deepEqual(normalizePontoData("15/10/2026"), { data: "15/10/2026", iso: "2026-10-15" });
  for (const data of ["31/02/2026", "29/02/2025", "2026-10-15", "5/10/2026", "00/12/2026", "12/13/2026"]) {
    assert.equal(normalizePontoData(data), undefined);
  }
  assert.equal(normalizePontoData("29/02/2024")?.iso, "2024-02-29");
});

test("SQL de periodo usa apenas parametros posicionais e views canonicas", () => {
  const sql = buildPontoPeriodoCode("db-sintetico", "2026-10-01", "2026-10-15");
  assert.doesNotThrow(() => new Function("return (" + sql + ")"));
  assert.match(sql, /FROM banco_horas/);
  assert.match(sql, /BETWEEN \?1 AND \?2/);
  assert.match(sql, /LIMIT 94/);
  assert.ok(!sql.includes("INSERT "));
  const single = buildPontoHojeCode("db-sintetico", "15/10/2026");
  assert.match(single, /WHERE data = \?1/);
});
