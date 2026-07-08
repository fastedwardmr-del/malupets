INSERT INTO companies (name, legal_name, nit, email, phone, address, city)
SELECT 'Malupets', 'Malupets', '', 'contacto@malupets.com', '', '', 'Bogotá'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 1);

INSERT INTO users (company_id, full_name, email, password_hash, role)
SELECT 1, 'Administrador', 'admin@malupets.com', 'admin123', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@malupets.com');

INSERT OR IGNORE INTO settings (company_id, setting_key, setting_value) VALUES
(1, 'invoice_prefix', 'MP'),
(1, 'invoice_next_number', '1'),
(1, 'tax_rate', '19'),
(1, 'cash_drawer_enabled', 'true'),
(1, 'printer_enabled', 'true');
