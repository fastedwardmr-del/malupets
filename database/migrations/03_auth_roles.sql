-- MALUPETS - Usuarios, sesiones, roles y permisos
-- Ejecutar una sola vez en D1 remoto.
--
-- Usuario administrador inicial:
--   Correo: admin@malupets.com
--   Contraseña: Malupets2026!
-- CAMBIA LA CONTRASEÑA DESPUÉS DEL PRIMER INGRESO.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL DEFAULT 1,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'CONSULTA',
  permissions TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_email
ON users(company_id, email);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

INSERT INTO users (
  company_id,
  full_name,
  email,
  password_hash,
  password_salt,
  role,
  permissions,
  is_active
)
SELECT
  1,
  'Administrador Malupets',
  'admin@malupets.com',
  's9pbtqcz2QlSzLAVZTQVYuUCL2p94EO5xFQc2GRJots=',
  'Z+H5wVVEbx6KPOsSmhvZ5w==',
  'ADMIN',
  '["*"]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM users
  WHERE company_id = 1 AND lower(email) = 'admin@malupets.com'
);
