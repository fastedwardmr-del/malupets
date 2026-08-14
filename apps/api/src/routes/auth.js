import { json, readJson } from "../utils/response.js";
import { getBearerToken, getSessionUser } from "../middleware/auth.js";

const encoder = new TextEncoder();
const SESSION_HOURS = 12;
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function derivePasswordHash(password, saltBase64) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: base64ToBytes(saltBase64),
    iterations: PBKDF2_ITERATIONS
  }, keyMaterial, 256);

  return bytesToBase64(new Uint8Array(bits));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizePermissions(value, role = "") {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value || "[]");
      if (Array.isArray(parsed)) return parsed;
    } catch {
      const cleaned = value.replace(/[\[\]"']/g, "");
      const list = cleaned.split(",").map(x => x.trim()).filter(Boolean);
      if (list.length) return list;
    }
  }

  return String(role || "").toUpperCase() === "ADMIN" ? ["*"] : [];
}

function publicUser(user) {
  const role = String(user.role || "").toUpperCase();
  return {
    id: user.id,
    company_id: user.company_id,
    full_name: user.full_name,
    email: user.email,
    role,
    permissions: normalizePermissions(user.permissions, role)
  };
}

export async function login(request, env) {
  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return json({ ok: false, error: "Correo y contraseña son obligatorios" }, 400);
  }

  const row = await env.DB.prepare(`
    SELECT id, company_id, full_name, email, password_hash, password_salt,
           role, permissions, is_active
    FROM users
    WHERE lower(email) = lower(?) AND company_id = 1
    LIMIT 1
  `).bind(email).first();

  if (!row || Number(row.is_active) !== 1) {
    return json({ ok: false, error: "Usuario o contraseña incorrectos" }, 401);
  }

  const candidate = await derivePasswordHash(password, row.password_salt);
  if (candidate !== row.password_hash) {
    return json({ ok: false, error: "Usuario o contraseña incorrectos" }, 401);
  }

  const token = randomToken();
  const tokenHash = await sha256(token);

  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= CURRENT_TIMESTAMP
  `).run();

  await env.DB.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+${SESSION_HOURS} hours'))
  `).bind(row.id, tokenHash).run();

  const permissions = normalizePermissions(row.permissions, row.role);
  const user = publicUser({ ...row, permissions });

  return json({
    ok: true,
    token,
    user,
    expires_in_hours: SESSION_HOURS
  });
}

export async function me(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ ok: false, error: "Sesión no válida o vencida" }, 401);
  return json({ ok: true, user: publicUser(user) });
}

export async function logout(request, env) {
  const token = getBearerToken(request);
  if (!token) return json({ ok: true });

  const tokenHash = await sha256(token);
  await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();

  return json({ ok: true, message: "Sesión cerrada" });
}
