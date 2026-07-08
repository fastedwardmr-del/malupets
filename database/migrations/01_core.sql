PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  legal_name TEXT,
  nit TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1E9FE6',
  secondary_color TEXT DEFAULT '#FFD91A',
  accent_color TEXT DEFAULT '#E83E9B',
  currency TEXT DEFAULT 'COP',
  timezone TEXT DEFAULT 'America/Bogota',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_email ON users(company_id, email);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  document_type TEXT,
  document_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_id, full_name);

CREATE TABLE IF NOT EXISTS pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  species TEXT,
  breed TEXT,
  sex TEXT,
  color TEXT,
  birth_date TEXT,
  weight REAL,
  photo_url TEXT,
  microchip TEXT,
  allergies TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_pets_company_customer ON pets(company_id, customer_id);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_company_key ON settings(company_id, setting_key);
