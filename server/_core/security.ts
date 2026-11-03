import type { NextFunction, Request, Response } from "express";

/**
 * tRPC's browser client uses POST for both reads and writes. Reject any POST
 * without an Origin matching the trusted public proxy host/protocol; a hostile
 * cross-site form cannot supply a matching Origin header. Do not infer the
 * browser-facing HTTPS scheme from req.secure or NODE_ENV.
 */
export function sameOriginPostGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") return next();
  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0].trim();
  const expectedHost = (forwardedHost || req.get("host") || "").trim().toLowerCase();
  const reject = () => res.status(403).json({ error: "A same-origin request is required." });
  if (!origin || !expectedHost) return reject();
  try {
    const parsed = new URL(origin);
    const hostMatches = parsed.host.toLowerCase() === expectedHost;
    const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0].trim();
    const originIsInternal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    // Managed Preview rewrites the browser Origin to its internal loopback
    // origin while forwarding the public host and HTTPS protocol. A hostile
    // cross-site form cannot manufacture this trusted proxy combination.
    const proxySameOrigin =
      Boolean(forwardedHost) && forwardedProto === "https" && originIsInternal;
    if (!hostMatches && !proxySameOrigin) {
      return reject();
    }
    const expectedProtocol = forwardedProto ? `${forwardedProto}:` : `${req.protocol}:`;
    if (!proxySameOrigin && parsed.protocol !== expectedProtocol) {
      return reject();
    }
  } catch {
    return reject();
  }
  return next();
}
