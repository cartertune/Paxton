import "dotenv/config";
import express from "express";
import session from "express-session";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { emailsRouter } from "./routes/emails";
import { settingsRouter } from "./routes/settings";

// Fail fast if required env vars are missing
const REQUIRED_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "ANTHROPIC_API_KEY",
  "SESSION_SECRET",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const IS_PROD = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: IS_PROD ? "none" : "lax",
      secure: IS_PROD,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      domain: IS_PROD ? undefined : undefined, // Let browser handle domain
    },
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/settings", settingsRouter);

// Global error handler — catches errors passed via next(err)
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
