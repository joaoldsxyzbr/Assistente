const ALLOWED_FIELDS = /* @__PURE__ */ new Set([
  "stage",
  "status",
  "outcome",
  "server",
  "tool",
  "write",
  "uncertain",
  "scopes",
  "traceId",
  "durationMs",
  "bytes",
  "transport",
  "phase",
  "category",
  "inputBytes",
  "fileCount",
  "batch"
]);
function audit(level, event, fields = {}) {
  const record = { event };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== void 0 && ALLOWED_FIELDS.has(key)) {
      record[key] = value;
    }
  }
  const message = JSON.stringify(record);
  if (level === "warn") console.warn(message);
  else console.log(message);
}
export {
  audit
};