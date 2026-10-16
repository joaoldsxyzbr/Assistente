const CLOUDFLARE_READ_TOOL_CATALOG = [
  {
    "name": "cloudflare_d1_listar",
    "description": "Lista bancos D1 da conta configurada, sem consultar dados nem alterar bancos.",
    "isWrite": false,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    }
  },
  {
    "name": "cloudflare_d1_estrutura",
    "description": "Lista tabelas e views do D1 canônico de ponto ou gastos (somente metadados).",
    "isWrite": false,
    "inputSchema": {
      "type": "object",
      "properties": {
        "banco": {
          "type": "string",
          "enum": [
            "ponto",
            "gastos"
          ]
        }
      },
      "required": [
        "banco"
      ],
      "additionalProperties": false
    }
  },
  {
    "name": "cloudflare_workers_listar",
    "description": "Lista Workers da conta configurada; consulta somente leitura.",
    "isWrite": false,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    }
  },
  {
    "name": "cloudflare_build_logs",
    "description": "Consulta as últimas linhas e o cursor de logs de um build Cloudflare Workers pelo UUID; somente leitura.",
    "isWrite": false,
    "inputSchema": {
      "type": "object",
      "properties": {
        "build_id": { "type": "string", "description": "UUID do Workers Build." },
        "cursor": { "type": "string", "description": "Cursor opcional de paginação." }
      },
      "required": ["build_id"],
      "additionalProperties": false
    }
  },
  {
    "name": "cloudflare_worker_diagnostico",
    "description": "Consulta as últimas implantações e versões de um Worker, sem publicar nem alterar tráfego.",
    "isWrite": false,
    "inputSchema": {
      "type": "object",
      "properties": {
        "nome": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64
        }
      },
      "required": [
        "nome"
      ],
      "additionalProperties": false
    }
  }
];
const D1_METADATA_SQL = "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 100;";
function validCloudflareId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
function buildCloudflareReadCode(name, args, ids) {
  if (name === "cloudflare_d1_listar") {
    return `async () => {
      const response = await cloudflare.request({ method: "GET", path: "/accounts/" + accountId + "/d1/database" });
      if (response.success !== true) throw new Error("Consulta D1 indisponível");
      const data = Array.isArray(response.result) ? response.result : [];
      return { total: data.length, bancos: data.slice(0, 100).map(b => ({ uuid: b.uuid, name: b.name, created_at: b.created_at })) };
    }`;
  }
  if (name === "cloudflare_d1_estrutura") {
    const id = args.banco === "ponto" ? ids.ponto : args.banco === "gastos" ? ids.gastos : undefined;
    if (!validCloudflareId(id) || ids.ponto === ids.gastos) return undefined;
    return `async () => {
      const response = await cloudflare.request({
        method: "POST",
        path: "/accounts/" + accountId + "/d1/database/" + ${JSON.stringify(id)} + "/query",
        body: { sql: ${JSON.stringify("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 100;")}, params: [] }
      });
      const result = Array.isArray(response.result) ? response.result[0] : undefined;
      if (!result || result.success !== true) throw new Error("Consulta de estrutura D1 indisponível");
      return { banco: ${JSON.stringify(args.banco)}, objetos: Array.isArray(result.results) ? result.results : [] };
    }`;
  }
  if (name === "cloudflare_workers_listar") {
    return `async () => {
      const response = await cloudflare.request({ method: "GET", path: "/accounts/" + accountId + "/workers/scripts" });
      if (response.success !== true) throw new Error("Consulta de Workers indisponível");
      const scripts = Array.isArray(response.result) ? response.result : [];
      return { total: scripts.length, workers: scripts.slice(0, 100).map(s => ({ id: s.id, modified_on: s.modified_on, created_on: s.created_on })) };
    }`;
  }
  if (name === "cloudflare_worker_diagnostico") {
    if (typeof args.nome !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(args.nome)) return undefined;
    return `async () => {
      const base = "/accounts/" + accountId + "/workers/scripts/" + ${JSON.stringify(args.nome)};
      const [deploys, versions] = await Promise.all([
        cloudflare.request({ method: "GET", path: base + "/deployments" }),
        cloudflare.request({ method: "GET", path: base + "/versions" })
      ]);
      if (deploys.success !== true || versions.success !== true) throw new Error("Diagnóstico do Worker indisponível");
      const deployments = Array.isArray(deploys.result?.deployments) ? deploys.result.deployments : [];
      const versoes = Array.isArray(versions.result) ? versions.result : [];
      return {
        worker: ${JSON.stringify(args.nome)},
        implantacoes: deployments.slice(0, 5).map(d => ({ id: d.id, created_on: d.created_on, source: d.source, versions: d.versions })),
        versoes: versoes.slice(0, 5).map(v => ({ id: v.id, number: v.number, created_on: v.metadata?.created_on }))
      };
    }`;
  }
  if (name === "cloudflare_build_logs") {
    if (!validCloudflareId(args.build_id) || (args.cursor !== undefined && (typeof args.cursor !== "string" || args.cursor.length > 2048))) return undefined;
    const suffix = args.cursor ? "?cursor=" + encodeURIComponent(args.cursor) : "";
    return `async () => {
      const response = await cloudflare.request({ method: "GET",
        path: "/accounts/" + accountId + "/builds/builds/" + ${JSON.stringify(args.build_id)} + ${JSON.stringify(suffix)} });
      if (response.success !== true) throw new Error("Logs de build indisponíveis");
      return { build_id: ${JSON.stringify(args.build_id)}, linhas: (response.result?.lines || []).slice(-60),
        cursor: response.result?.cursor ?? null, truncado: response.result?.truncated ?? false };
    }`;
  }
  return undefined;
}
export { CLOUDFLARE_READ_TOOL_CATALOG, buildCloudflareReadCode, validCloudflareId };
