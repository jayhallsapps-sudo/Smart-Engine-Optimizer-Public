import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { attachSession } from "./auth";
import { bootstrapAdminIfNeeded } from "./auth";
import { pool } from "./db";
import { startReportScheduler } from "./reportScheduler";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));
app.use(cookieParser());

// ─── Sessions ────────────────────────────────────────────────────────────────
// Sessions are stored in Postgres via connect-pg-simple. The store auto-creates
// its `session` table on first run when `createTableIfMissing: true`.
const isProd = process.env.NODE_ENV === "production";
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  if (isProd) {
    throw new Error(
      "SESSION_SECRET env var is required in production. Set it in Replit Secrets (use a long random string).",
    );
  }
  console.warn(
    "[session] SESSION_SECRET is not set — using a random ephemeral secret. " +
      "Sessions will be invalidated on every restart. Set SESSION_SECRET in Replit Secrets to fix.",
  );
}

const PgSession = connectPgSimple(session);
app.set("trust proxy", 1); // Replit terminates TLS upstream
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true, tableName: "session" }),
    secret: SESSION_SECRET || `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    },
    name: "smarteo.sid",
  }),
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// ─── Session resolution ───────────────────────────────────────────────────────
// attachSession reads the smarteo_session HTTP-only cookie, looks up the session
// in the userSessions table, and populates req.currentUser + req.currentUserPerms.
// This is the single source of truth for authentication — no express-session needed.
app.use(attachSession);

(async () => {
  await bootstrapAdminIfNeeded();
  await registerRoutes(httpServer, app);
  startReportScheduler();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
