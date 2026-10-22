const encoder = new TextEncoder();

function splitScopes(value) {
  return String(value ?? "").trim().split(/[ ,]+/).filter(Boolean).join(" ");
}

async function verifyIdentity({ env, accessToken, fetchJson }) {
  const identity = await fetchJson("https://api.github.com/user", {
    headers: {
      authorization: "Bearer " + accessToken,
      "user-agent": "assistente-mcps",
      accept: "application/vnd.github+json"
    }
  });
  const expected = env.GITHUB_EXPECTED_LOGIN;
  return Boolean(identity.login && (!expected || identity.login.toLowerCase() === expected.toLowerCase()));
}

async function revoke({ token, fetchFn }) {
  const credentials = encoder.encode(token.client_id + ":" + token.client_secret);
  const response = await fetchFn(
    "https://api.github.com/applications/" + encodeURIComponent(token.client_id) + "/token",
    {
      method: "DELETE",
      redirect: "manual",
      headers: {
        authorization: "Basic " + btoa(String.fromCharCode(...credentials)),
        "content-type": "application/json",
        "user-agent": "assistente-mcps",
        accept: "application/vnd.github+json"
      },
      body: JSON.stringify({ access_token: token.access_token })
    }
  );
  return response.ok || response.status === 404;
}

export const githubProvider = Object.freeze({
  label: "GitHub",
  endpoint: "https://api.githubcopilot.com/mcp/x/all",
  resourceHosts: new Set(["api.githubcopilot.com", "github.com"]),
  authHosts: new Set(["github.com", "api.github.com"]),
  allowSubdomains: false,
  identityFailure: "A conta GitHub autorizada não corresponde à conta configurada.",
  defaultScopes: "repo read:org read:user user:email read:packages write:packages read:project project gist notifications workflow offline_access",
  async clientOptions({ env, metadata }) {
    const clientId = env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw Error("GITHUB_OAUTH_APP_UNCONFIGURED");
    return {
      ...metadata,
      client_id: clientId,
      client_secret: clientSecret,
      token_endpoint_auth_method: "client_secret_post",
      scope: splitScopes(env.GITHUB_OAUTH_SCOPES || this.defaultScopes)
    };
  },
  verifyIdentity,
  revoke
});