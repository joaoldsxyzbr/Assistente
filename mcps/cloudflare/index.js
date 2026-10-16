function splitScopes(value) {
  return String(value ?? "").trim().split(/[ ,]+/).filter(Boolean).join(" ");
}

async function clientOptions({ env, metadata, fetchJson, readSealed, writeSealed, callbackUrl }) {
  let client = await readSealed(env, "client:cloudflare");
  if (!metadata.registration_endpoint) throw Error("CLOUDFLARE_DCR_UNAVAILABLE");
  if (!client || client.registration_endpoint !== metadata.registration_endpoint ||
      (client.client_secret_expires_at && client.client_secret_expires_at * 1000 < Date.now())) {
    const registered = await fetchJson(metadata.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_name: "Assistente MCPs",
        redirect_uris: [callbackUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      })
    });
    if (typeof registered.client_id !== "string" || !registered.client_id) throw Error("CLOUDFLARE_DCR_INVALID");
    client = {
      client_id: registered.client_id,
      client_secret: registered.client_secret ?? "",
      token_endpoint_auth_method: registered.token_endpoint_auth_method ?? "none",
      registration_endpoint: metadata.registration_endpoint,
      client_secret_expires_at: registered.client_secret_expires_at ?? 0
    };
    await writeSealed(env, "client:cloudflare", client);
  }
  return {
    ...metadata,
    ...client,
    scope: splitScopes(env.CLOUDFLARE_OAUTH_SCOPES)
  };
}

async function revoke({ token, fetchFn, clientAuth }) {
  if (!token.revocation_endpoint) return false;
  let ok = true;
  for (const value of [token.refresh_token, token.access_token].filter(Boolean)) {
    const body = new URLSearchParams({ token: value });
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
    if (token.client_id) clientAuth(token, body, headers);
    const response = await fetchFn(token.revocation_endpoint, {
      method: "POST",
      redirect: "error",
      headers,
      body: body.toString()
    });
    ok = ok && (response.ok || response.status === 200);
  }
  return ok;
}

export const cloudflareProvider = Object.freeze({
  label: "Cloudflare",
  endpoint: "https://mcp.cloudflare.com/mcp",
  resourceHosts: new Set(["mcp.cloudflare.com"]),
  authHosts: new Set(["cloudflare.com", "cloudflareaccess.com"]),
  allowSubdomains: true,
  async clientOptions(context) {
    return clientOptions(context);
  },
  async revoke(context) {
    return revoke(context);
  }
});
