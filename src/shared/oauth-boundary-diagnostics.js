const DIAGNOSTIC_TTL_SECONDS = 60 * 60;
const DIAGNOSTIC_PREFIX = "diagnostic:oauth:";
async function recordOAuthBoundary(store, stage, status, code) {
  if (store === void 0) return;
  const record = {
    stage,
    observedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (status !== void 0) record.status = status;
  if (code !== void 0) record.code = code;
  try {
    await store.put(
      DIAGNOSTIC_PREFIX + stage,
      JSON.stringify(record),
      { expirationTtl: DIAGNOSTIC_TTL_SECONDS }
    );
  } catch {
  }
}
function isSafeOAuthErrorCode(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value);
}
async function readSafeOAuthErrorCode(response) {
  if (response.ok) return void 0;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return void 0;
  }
  try {
    const body = await response.clone().json();
    if (body !== null && typeof body === "object" && "error" in body && isSafeOAuthErrorCode(body.error)) {
      return body.error;
    }
  } catch {
  }
  return void 0;
}
export {
  readSafeOAuthErrorCode,
  recordOAuthBoundary
};
