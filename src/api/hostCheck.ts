import type { RequestHandler } from "express";

/**
 * Host-header allow-list, protecting the API against DNS rebinding.
 *
 * The server has no authentication and can move, copy and trash files. Binding to loopback
 * keeps other machines out, but not a malicious web page open in the user's own browser: by
 * pointing its own domain's DNS at 127.0.0.1, such a page can make requests to this server
 * that the browser treats as same-origin. Those requests still carry the attacker's domain in
 * their `Host` header, so rejecting any Host that isn't a known local name closes that door.
 */

const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];
const WILDCARD_BIND_HOSTS = new Set(["0.0.0.0", "::", "[::]", "0"]);

/** Lowercases a hostname, drops a trailing dot, and brackets a bare IPv6 address, so the
 * same host always compares equal however it was written. */
function normalizeHostname(hostname: string): string {
  let normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (normalized.includes(":") && !normalized.startsWith("[")) normalized = `[${normalized}]`;
  return normalized;
}

/** Extracts the hostname (without port) from a `Host` header value, or `undefined` if it's
 * missing or malformed. */
export function parseHostHeader(hostHeader: string | undefined): string | undefined {
  if (!hostHeader) return undefined;
  const value = hostHeader.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? undefined : normalizeHostname(value.slice(0, end + 1));
  }
  const hostname = value.split(":")[0];
  return hostname ? normalizeHostname(hostname) : undefined;
}

/**
 * The hostnames the server answers to: always loopback; plus the configured bind address
 * when it's a specific one (e.g. `HOST=192.168.1.5`); plus any comma-separated names in
 * `ALLOWED_HOSTS` — needed for LAN access when binding to a wildcard address like 0.0.0.0.
 */
export function resolveAllowedHosts(bindHost: string, rawAllowedHosts: string | undefined): string[] {
  const allowed = new Set(LOOPBACK_HOSTNAMES);
  const bind = normalizeHostname(bindHost);
  if (bind && !WILDCARD_BIND_HOSTS.has(bind)) allowed.add(bind);
  for (const entry of rawAllowedHosts?.split(",") ?? []) {
    if (entry.trim()) allowed.add(normalizeHostname(entry));
  }
  return [...allowed];
}

/** Rejects (403) any request whose `Host` header isn't in `allowedHosts`, before it reaches a route. */
export function hostCheck(allowedHosts: string[]): RequestHandler {
  const allowed = new Set(allowedHosts.map(normalizeHostname));
  return (req, res, next) => {
    const hostname = parseHostHeader(req.headers.host);
    if (hostname && allowed.has(hostname)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden: unrecognized Host header" });
  };
}
