import { Router } from "express";
import { google } from "googleapis";
import { tokenStore } from "../services/tokenStore";

export const authRouter = Router();

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

authRouter.get("/google", (req, res) => {
  const oauth2Client = createOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
  res.redirect(url);
});

authRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }

  try {
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user email
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? "unknown";

    console.log("[AUTH] Setting token for email:", email);

    // Generate a session token
    const sessionToken = req.session.id;
    await tokenStore.set(sessionToken, { tokens, email });

    console.log("[AUTH] Redirecting with token to:", process.env.CLIENT_ORIGIN);

    // Redirect to frontend with token in URL
    const redirectUrl = new URL(
      process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    );
    redirectUrl.searchParams.set("token", sessionToken);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("OAuth error");
  }
});

authRouter.get("/me", async (req, res) => {
  // Check for token in Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  console.log("[AUTH /me] Token:", token ? "present" : "missing");

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const record = await tokenStore.get(token);
  console.log("[AUTH /me] Token found:", !!record);

  if (!record) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ email: record.email });
});

authRouter.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  if (token) {
    await tokenStore.delete(token);
  }

  res.json({ ok: true });
});
