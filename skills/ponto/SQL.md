# SQL validada — skill Ponto

Referência para chamadas pelo **MCP oficial Cloudflare**. Este arquivo é documentação, não um serviço nem um script executado.

- `account_id`: `924f32dc9eeb8946dc033801c0c17c42`
- `database_id`: `96b39cda-f037-4259-b406-09fea5431469`
- Endpoint: `POST /accounts/{account_id}/d1/database/{database_id}/query`.
- Corpo: `{ "sql": "...", "params": ["data", "horário"] }`.
- Execute com a ferramenta `execute` do MCP Cloudflare, que oferece `cloudflare.request`. Nunca use ID de gastos.
- A ferramenta `execute` deve receber `account_id` oficial e um `code` em forma de arrow function `async () => { ... }`.
- SQL de registro usa `data` em `DD/MM/AAAA` e horário `HH:MM`. Data atual deve vir de `America/Sao_Paulo`.
- `PERIODO_SUMMARY_SQL` usa duas datas ISO `AAAA-MM-DD` para comparações, com máximo de 93 dias.
- Não repetir escrita após erro incerto; reconciliar por consulta. Verificar `success` do envelope e do resultado D1.

## Exemplo de envoltório de leitura

```js
async () => {
  const response = await cloudflare.request({
    method: "POST",
    path: "/accounts/" + accountId + "/d1/database/96b39cda-f037-4259-b406-09fea5431469/query",
    body: { sql: "SELECT data, entrada, ida_intervalo, volta_intervalo, saida FROM pontos WHERE data = ?1", params: ["16/10/2026"] }
  });
  if (response.success !== true || !Array.isArray(response.result) || response.result[0]?.success !== true) {
    throw new Error("D1_QUERY_FAILED");
  }
  return response.result[0].results;
}
```

## Consultas e registros

### WEEKDAY_REGISTER_SQL

```sql
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
```

### SATURDAY_REGISTER_SQL

```sql
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
```

### READ_DAY_SQL

```sql
SELECT data, entrada, ida_intervalo, volta_intervalo, saida
FROM pontos
WHERE data = ?1;
```

### TODAY_SUMMARY_SQL

```sql
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
```

### BANK_SUMMARY_SQL

```sql
SELECT dias_trabalhados, horas_trabalhadas, banco_horas
FROM resumo
LIMIT 1;
```

### PERIODO_SUMMARY_SQL

```sql
SELECT data, entrada, ida_intervalo, volta_intervalo, saida,
  carga_minutos, trabalhado_minutos, saldo_final_minutos, status
FROM banco_horas
WHERE (substr(data, 7, 4) || '-' || substr(data, 4, 2) || '-' || substr(data, 1, 2))
  BETWEEN ?1 AND ?2
ORDER BY substr(data, 7, 4), substr(data, 4, 2), substr(data, 1, 2)
LIMIT 94;
```

**Critério de confirmação:** uma inserção só está registrada se `RETURNING` devolver a linha com o horário no campo esperado; retorno vazio exige conferir estado atual, não tentar novamente automaticamente.
