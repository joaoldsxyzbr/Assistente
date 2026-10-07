import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPontoHojeCode,
  buildPontoRegistrarCode,
  buildPontoResumoCode,
  currentPontoLocalDate,
  normalizePontoHorario,
  PONTO_TOOL_CATALOG,
} from "../src/mcps/ponto/tools.ts";

test("normaliza horarios aceitos pelo comando ponto", () => {
  assert.equal(normalizePontoHorario("0651"), "06:51");
  assert.equal(normalizePontoHorario("17:09"), "17:09");
  assert.equal(normalizePontoHorario(" 1230 "), "12:30");
  assert.equal(normalizePontoHorario("2460"), undefined);
  assert.equal(normalizePontoHorario("6:51"), undefined);
});

test("resolve data e dia da semana em America/Sao_Paulo", () => {
  const saturday = currentPontoLocalDate(new Date("2026-10-10T15:00:00Z"));
  const sunday = currentPontoLocalDate(new Date("2026-10-11T15:00:00Z"));

  assert.deepEqual(saturday, { data: "10/10/2026", weekday: "Sat" });
  assert.deepEqual(sunday, { data: "11/10/2026", weekday: "Sun" });
});

test("publica somente os tres comandos simples de ponto", () => {
  assert.deepEqual(
    PONTO_TOOL_CATALOG.map(({ name, isWrite }) => ({ name, isWrite })),
    [
      { name: "ponto_registrar", isWrite: true },
      { name: "ponto_hoje", isWrite: false },
      { name: "ponto_resumo", isWrite: false },
    ],
  );
});

test("gera codigo valido para o Cloudflare MCP sem binding D1 local", () => {
  const databaseId = "db-test";
  const snippets = [
    buildPontoRegistrarCode(databaseId, "10/10/2026", "11:11", true),
    buildPontoRegistrarCode(databaseId, "09/10/2026", "06:51", false),
    buildPontoHojeCode(databaseId, "09/10/2026"),
    buildPontoResumoCode(databaseId),
  ];

  for (const code of snippets) {
    assert.doesNotThrow(() => new Function(`return (${code});`));
    assert.match(code, /cloudflare\.request/);
    assert.match(code, /\/d1\/database\//);
    assert.match(code, /db-test/);
  }
});

test("registro de sabado usa apenas entrada e saida", () => {
  const code = buildPontoRegistrarCode(
    "db-test",
    "10/10/2026",
    "11:11",
    true,
  );

  assert.match(code, /const saturday = true/);
  assert.match(code, /\["entrada", "saida"\]/);
});

test("registro de dia util preserva as quatro batidas", () => {
  const code = buildPontoRegistrarCode(
    "db-test",
    "09/10/2026",
    "12:35",
    false,
  );

  assert.match(code, /ida_intervalo/);
  assert.match(code, /volta_intervalo/);
  assert.match(code, /const saturday = false/);
});
