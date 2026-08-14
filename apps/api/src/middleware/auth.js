import { json } from "../utils/response.js";

const encoder = new TextEncoder();

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function parsePermissions(value, role = "") {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value || "[]");
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Compatibilidad con valores antiguos o mal serializados.
      const cleaned = value.replace(/[\[\]"']/g, "");
      const list = cleaned.split(",").map(x => x.trim()).filter(Boolean);
      if (list.length) return list;
    }
  }

  return String(role || "").toUpperCase() === "ADMIN" ? ["*"] : [];
}

export function hasPermission(user, permission) {
  if (!permission) return true;
  if (!user) return false;

  // Un ADMIN válido siempre conserva acceso total aunque el campo
  // permissions venga de una versión anterior de la base.
  if (String(user.role || "").toUpperCase() === "ADMIN") return true;

  const permissions = parsePermissions(user.permissions, user.role);
  if (permissions.includes("*")) return true;

  if (Array.isArray(permission)) {
    return permission.some(p => permissions.includes(p));
  }

  return permissions.includes(permission);
}

export async function getSessionUser(request, env) {
  const token = getBearerToken(request);
  if (!token) return null;

  const tokenHash = await sha256(token);

  const row = await env.DB.prepare(`
    SELECT
      u.id,
      u.company_id,
      u.full_name,
      u.email,
      u.role,
      u.permissions,
      u.is_active,
      s.id AS session_id,
      s.expires_at
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > CURRENT_TIMESTAMP
      AND u.is_active = 1
    LIMIT 1
  `).bind(tokenHash).first();

  if (!row) return null;

  return {
    id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
    email: row.email,
    role: String(row.role || "").toUpperCase(),
    permissions: parsePermissions(row.permissions, row.role),
    session_id: row.session_id,
    expires_at: row.expires_at
  };
}

export async function requireAuth(request, env, permission = null) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return {
      ok: false,
      response: json({ ok: false, error: "Sesión no válida o vencida" }, 401)
    };
  }

  if (!hasPermission(user, permission)) {
    return {
      ok: false,
      response: json({ ok: false, error: "No tienes permiso para realizar esta acción" }, 403)
    };
  }

  return { ok: true, user };
}
