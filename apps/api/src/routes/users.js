import { json, readJson } from "../utils/response.js";

const encoder = new TextEncoder();
const COMPANY_ID = 1;
const PBKDF2_ITERATIONS = 100000;

const ROLE_PERMISSIONS = {
  ADMIN: ["*"],
  VENTAS: ["dashboard", "pos", "sales", "customers", "pets", "inventory", "cash"],
  SPA: ["dashboard", "agenda", "customers", "pets"],
  CONSULTA: ["dashboard", "customers", "pets"]
};

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function passwordHash(password, saltBase64) {
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

function newSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

function normalizeRole(role) {
  const value = String(role || "CONSULTA").toUpperCase();
  return ROLE_PERMISSIONS[value] ? value : "CONSULTA";
}

function normalizePermissions(role, permissions) {
  if (Array.isArray(permissions) && permissions.length) {
    return [...new Set(permissions.map(String))];
  }
  return ROLE_PERMISSIONS[role] || [];
}

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listUsers(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT id, company_id, full_name, email, role, permissions,
           is_active, created_at, updated_at
    FROM users
    WHERE company_id = ?
    ORDER BY full_name ASC
  `).bind(COMPANY_ID).all();

  return json(results.map(user => ({
    ...user,
    permissions: parsePermissions(user.permissions)
  })));
}

export async function createUser(request, env) {
  const body = await readJson(request);
  const fullName = String(body.full_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!fullName) return json({ ok: false, error: "El nombre es obligatorio" }, 400);
  if (!email) return json({ ok: false, error: "El correo es obligatorio" }, 400);
  if (password.length < 8) {
    return json({ ok: false, error: "La contraseña debe tener mínimo 8 caracteres" }, 400);
  }

  const existing = await env.DB.prepare(`
    SELECT id FROM users WHERE lower(email) = lower(?) AND company_id = ?
  `).bind(email, COMPANY_ID).first();

  if (existing) return json({ ok: false, error: "Ya existe un usuario con ese correo" }, 409);

  const role = normalizeRole(body.role);
  const permissions = normalizePermissions(role, body.permissions);
  const salt = newSalt();
  const hash = await passwordHash(password, salt);

  const result = await env.DB.prepare(`
    INSERT INTO users (
      company_id, full_name, email, password_hash, password_salt,
      role, permissions, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    COMPANY_ID,
    fullName,
    email,
    hash,
    salt,
    role,
    JSON.stringify(permissions),
    body.is_active === 0 ? 0 : 1
  ).run();

  return json({
    ok: true,
    message: "Usuario creado correctamente",
    id: result.meta.last_row_id
  }, 201);
}

export async function updateUser(request, env, id, currentUser) {
  const userId = Number(id);
  const body = await readJson(request);

  const existing = await env.DB.prepare(`
    SELECT id, full_name, email, role, permissions, is_active
    FROM users
    WHERE id = ? AND company_id = ?
  `).bind(userId, COMPANY_ID).first();

  if (!existing) return json({ ok: false, error: "Usuario no encontrado" }, 404);

  const fullName = String(body.full_name ?? existing.full_name).trim();
  const email = String(body.email ?? existing.email).trim().toLowerCase();
  const role = normalizeRole(body.role ?? existing.role);
  const permissions = normalizePermissions(
    role,
    Array.isArray(body.permissions) ? body.permissions : parsePermissions(existing.permissions)
  );
  const isActive = body.is_active == null ? Number(existing.is_active) : Number(body.is_active ? 1 : 0);

  if (!fullName || !email) {
    return json({ ok: false, error: "Nombre y correo son obligatorios" }, 400);
  }

  const duplicate = await env.DB.prepare(`
    SELECT id FROM users
    WHERE lower(email) = lower(?) AND company_id = ? AND id <> ?
  `).bind(email, COMPANY_ID, userId).first();

  if (duplicate) return json({ ok: false, error: "Ya existe otro usuario con ese correo" }, 409);

  if (Number(currentUser.id) === userId && isActive === 0) {
    return json({ ok: false, error: "No puedes desactivar tu propio usuario" }, 400);
  }

  await env.DB.prepare(`
    UPDATE users
    SET full_name = ?, email = ?, role = ?, permissions = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).bind(
    fullName,
    email,
    role,
    JSON.stringify(permissions),
    isActive,
    userId,
    COMPANY_ID
  ).run();

  const newPassword = String(body.password || "");
  if (newPassword) {
    if (newPassword.length < 8) {
      return json({ ok: false, error: "La nueva contraseña debe tener mínimo 8 caracteres" }, 400);
    }

    const salt = newSalt();
    const hash = await passwordHash(newPassword, salt);

    await env.DB.prepare(`
      UPDATE users
      SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `).bind(hash, salt, userId, COMPANY_ID).run();

    await env.DB.prepare(`
      DELETE FROM sessions WHERE user_id = ? AND id NOT IN (
        SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
      )
    `).bind(userId, userId).run();
  }

  return json({ ok: true, message: "Usuario actualizado correctamente" });
}

export function roleDefaults() {
  return ROLE_PERMISSIONS;
}
