PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS appointment_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_services_company_name
ON appointment_services(company_id, name);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL DEFAULT 1,
  customer_id INTEGER NOT NULL,
  pet_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  assigned_user_id INTEGER,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  notes TEXT DEFAULT '',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (pet_id) REFERENCES pets(id),
  FOREIGN KEY (service_id) REFERENCES appointment_services(id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_company_start
ON appointments(company_id, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_assigned_start
ON appointments(assigned_user_id, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_pet
ON appointments(pet_id, start_at);

INSERT OR IGNORE INTO appointment_services
(company_id, name, duration_minutes, is_active, sort_order)
VALUES
(1, 'Baño', 60, 1, 10),
(1, 'Peluquería', 90, 1, 20),
(1, 'Baño + peluquería', 120, 1, 30),
(1, 'Consulta veterinaria', 45, 1, 40),
(1, 'Vacunación', 30, 1, 50),
(1, 'Desparasitación', 30, 1, 60);
