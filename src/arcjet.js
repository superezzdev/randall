import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.NODE_ENV === "development" ? "DRY_RUN" : "LIVE";

if (!arcjetKey) {
  console.warn("⚠️ ARCJET_KEY environment variable is missing. Security features will be disabled.");
}

export const httpArcjet = arcjetKey
  ? arcjet({
      key: arcjetKey,
      rules: [
        shield({ mode: arcjetMode }),
        detectBot({
          mode: arcjetMode,
          allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
        }),
        slidingWindow({
          mode: arcjetMode,
          interval: "10s",
          max: 50,
        }),
      ],
    })
  : null;

export const wsArcjet = arcjetKey
  ? arcjet({
      key: arcjetKey,
      rules: [
        shield({ mode: arcjetMode }),
        detectBot({
          mode: arcjetMode,
          allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
        }),
        slidingWindow({
          mode: arcjetMode,
          interval: "10s",
          max: 30,
        }),
      ],
    })
  : null;

export function securityMiddleware() {
  return async (req, res, next) => {
    if (!httpArcjet) return next();

    try {
      const ipSrc = req.ip || req.headers["x-forwarded-for"]?.split(',')[0] || req.socket?.remoteAddress;
      const decision = await httpArcjet.protect(req, { ipSrc });

      if (decision.isDenied()) {
        if (decision.reason.isRateLimit()) {
          return res.status(429).json({
            error: "Too many requests.",
          });
        }

        return res.status(403).json({
          error: "Forbidden.",
        });
      }
    } catch (e) {
      console.error("Arcjet middleware error", e);
      return res.status(503).json({
        error: "Service Unavailable",
      });
    }

    next();
  };
}
