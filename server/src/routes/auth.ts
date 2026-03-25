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

    await tokenStore.set(req.session.id, { tokens, email });

    // Save session explicitly before redirecting so the cookie is committed
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        res.status(500).send("Session error");
        return;
      }
      res.redirect(process.env.CLIENT_ORIGIN ?? "http://localhost:5173");
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("OAuth error");
  }
});

authRouter.get("/me", async (req, res) => {
  const record = await tokenStore.get(req.session.id);
  if (!record) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ email: record.email });
});

authRouter.post("/logout", async (req, res) => {
  await tokenStore.delete(req.session.id);
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});
