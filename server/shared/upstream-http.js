// Workers supports manual redirects. Never forward credentials to a redirect target.
export async function fetchUpstream(fetchFn, url, init = {}, timeoutMs = 15000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchFn(url, { ...init, redirect: "manual", signal });
  } catch (error) {
    if (timeout.aborted) throw Error("UPSTREAM_REQUEST_TIMEOUT");
    throw error;
  }
  if (response.status >= 300 && response.status < 400) throw Error("UPSTREAM_REDIRECT_REJECTED");
  return response;
}
