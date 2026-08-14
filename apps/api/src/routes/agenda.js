import { json, readJson } from "../utils/response.js";

const COMPANY_ID = 1;
const VALID_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW"
];

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeDateTime(value) {
  const v = clean(value).replace("T", " ");
  if (!v) return "";
  return v.length === 16 ? `${v}:00` : v;
}

function parsePermissions(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function userCanAgenda(user) {
  if (!user || Number(user.is_active) !== 1) return false;
  if (String(user.role || "").toUpperCase() === "ADMIN") return true;
  return parsePermissions(user.permissions).includes("agenda");
}

function addMinutes(dateTime, minutes) {
  const [datePart, timePart = "00:00:00"] = dateTime.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss = 0] = timePart.split(":").map(Number);
  const date = new Date(y, m - 1, d, hh, mm, ss);
  date.setMinutes(date.getMinutes() + Number(minutes || 0));
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function validateAppointmentBody(env, body, appointmentId = null) {
  const customerId = Number(body.customer_id);
  const petId = Number(body.pet_id);
  const serviceId = Number(body.service_id);
  const assignedUserId = body.assigned_user_id ? Number(body.assigned_user_id) : null;
  const startAt = normalizeDateTime(body.start_at);
  const status = VALID_STATUSES.includes(clean(body.status).toUpperCase())
    ? clean(body.status).toUpperCase()
    : "SCHEDULED";

  if (!customerId) return { error: "El cliente es obligatorio" };
  if (!petId) return { error: "La mascota es obligatoria" };
  if (!serviceId) return { error: "El servicio es obligatorio" };
  if (!startAt) return { error: "La fecha y hora son obligatorias" };

  const customer = await env.DB.prepare(`
    SELECT id, full_name FROM customers
    WHERE id = ? AND company_id = ? AND is_active = 1
  `).bind(customerId, COMPANY_ID).first();

  if (!customer) return { error: "Cliente no encontrado" };

  const pet = await env.DB.prepare(`
    SELECT id, name, customer_id FROM pets
    WHERE id = ? AND company_id = ? AND is_active = 1
  `).bind(petId, COMPANY_ID).first();

  if (!pet) return { error: "Mascota no encontrada" };
  if (Number(pet.customer_id) !== customerId) {
    return { error: "La mascota no pertenece al cliente seleccionado" };
  }

  const service = await env.DB.prepare(`
    SELECT id, name, duration_minutes
    FROM appointment_services
    WHERE id = ? AND company_id = ? AND is_active = 1
  `).bind(serviceId, COMPANY_ID).first();

  if (!service) return { error: "Servicio no encontrado" };

  if (assignedUserId) {
    const staff = await env.DB.prepare(`
      SELECT id, full_name, role, permissions, is_active
      FROM users
      WHERE id = ? AND company_id = ?
    `).bind(assignedUserId, COMPANY_ID).first();

    if (!userCanAgenda(staff)) {
      return { error: "El responsable seleccionado no tiene acceso a Agenda" };
    }
  }

  const endAt = normalizeDateTime(body.end_at) ||
    addMinutes(startAt, Number(service.duration_minutes || 60));

  // Evita solapamientos del mismo responsable, excepto citas canceladas/no asistió.
  if (assignedUserId && !["CANCELLED", "NO_SHOW"].includes(status)) {
    let sql = `
      SELECT id, start_at, end_at
      FROM appointments
      WHERE company_id = ?
        AND assigned_user_id = ?
        AND status NOT IN ('CANCELLED', 'NO_SHOW')
        AND datetime(start_at) < datetime(?)
        AND datetime(end_at) > datetime(?)
    `;
    const bindings = [COMPANY_ID, assignedUserId, endAt, startAt];

    if (appointmentId) {
      sql += ` AND id <> ?`;
      bindings.push(Number(appointmentId));
    }

    sql += ` LIMIT 1`;

    const overlap = await env.DB.prepare(sql).bind(...bindings).first();
    if (overlap) {
      return {
        error: "El responsable ya tiene otra cita en ese horario",
        conflict_id: overlap.id
      };
    }
  }

  return {
    customerId,
    petId,
    serviceId,
    assignedUserId,
    startAt,
    endAt,
    status,
    notes: clean(body.notes),
    customer,
    pet,
    service
  };
}

export async function agendaBootstrap(request, env) {
  const [
    customerRows,
    petRows,
    userRows,
    serviceRows
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT id, full_name, phone, email
      FROM customers
      WHERE company_id = ? AND is_active = 1
      ORDER BY full_name ASC
    `).bind(COMPANY_ID).all(),

    env.DB.prepare(`
      SELECT id, customer_id, name, species, breed
      FROM pets
      WHERE company_id = ? AND is_active = 1
      ORDER BY name ASC
    `).bind(COMPANY_ID).all(),

    env.DB.prepare(`
      SELECT id, full_name, role, permissions, is_active
      FROM users
      WHERE company_id = ? AND is_active = 1
      ORDER BY full_name ASC
    `).bind(COMPANY_ID).all(),

    env.DB.prepare(`
      SELECT id, name, duration_minutes
      FROM appointment_services
      WHERE company_id = ? AND is_active = 1
      ORDER BY sort_order ASC, name ASC
    `).bind(COMPANY_ID).all()
  ]);

  const staff = (userRows.results || [])
    .filter(userCanAgenda)
    .map(user => ({
      id: user.id,
      full_name: user.full_name,
      role: user.role
    }));

  return json({
    ok: true,
    customers: customerRows.results || [],
    pets: petRows.results || [],
    staff,
    services: serviceRows.results || []
  });
}

export async function listAppointments(request, env) {
  const url = new URL(request.url);
  const from = clean(url.searchParams.get("from"));
  const to = clean(url.searchParams.get("to"));
  const assignedUserId = Number(url.searchParams.get("assigned_user_id") || 0);
  const status = clean(url.searchParams.get("status")).toUpperCase();

  let sql = `
    SELECT
      a.*,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      p.name AS pet_name,
      p.species AS pet_species,
      p.breed AS pet_breed,
      s.name AS service_name,
      s.duration_minutes AS service_duration,
      u.full_name AS assigned_user_name,
      creator.full_name AS created_by_name
    FROM appointments a
    INNER JOIN customers c ON c.id = a.customer_id
    INNER JOIN pets p ON p.id = a.pet_id
    INNER JOIN appointment_services s ON s.id = a.service_id
    LEFT JOIN users u ON u.id = a.assigned_user_id
    LEFT JOIN users creator ON creator.id = a.created_by
    WHERE a.company_id = ?
  `;

  const bindings = [COMPANY_ID];

  if (from) {
    sql += ` AND datetime(a.start_at) >= datetime(?)`;
    bindings.push(normalizeDateTime(from));
  }

  if (to) {
    sql += ` AND datetime(a.start_at) < datetime(?)`;
    bindings.push(normalizeDateTime(to));
  }

  if (assignedUserId) {
    sql += ` AND a.assigned_user_id = ?`;
    bindings.push(assignedUserId);
  }

  if (status && VALID_STATUSES.includes(status)) {
    sql += ` AND a.status = ?`;
    bindings.push(status);
  }

  sql += ` ORDER BY datetime(a.start_at) ASC, a.id ASC LIMIT 500`;

  const { results } = await env.DB.prepare(sql).bind(...bindings).all();
  return json(results || []);
}

export async function createAppointment(request, env, user) {
  const body = await readJson(request);
  const valid = await validateAppointmentBody(env, body);

  if (valid.error) {
    return json({ ok: false, error: valid.error, conflict_id: valid.conflict_id }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO appointments (
      company_id, customer_id, pet_id, service_id, assigned_user_id,
      start_at, end_at, status, notes, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    COMPANY_ID,
    valid.customerId,
    valid.petId,
    valid.serviceId,
    valid.assignedUserId,
    valid.startAt,
    valid.endAt,
    valid.status,
    valid.notes,
    user.id
  ).run();

  return json({
    ok: true,
    message: "Cita creada correctamente",
    id: result.meta.last_row_id
  }, 201);
}

export async function updateAppointment(request, env, id) {
  const appointmentId = Number(id);
  if (!appointmentId) {
    return json({ ok: false, error: "ID de cita requerido" }, 400);
  }

  const existing = await env.DB.prepare(`
    SELECT * FROM appointments
    WHERE id = ? AND company_id = ?
  `).bind(appointmentId, COMPANY_ID).first();

  if (!existing) {
    return json({ ok: false, error: "Cita no encontrada" }, 404);
  }

  if (String(existing.status || "").toUpperCase() === "COMPLETED") {
    return json({
      ok: false,
      error: "Una cita completada queda bloqueada y ya no puede editarse"
    }, 409);
  }

  const body = await readJson(request);
  const merged = {
    ...existing,
    ...body,
    customer_id: body.customer_id ?? existing.customer_id,
    pet_id: body.pet_id ?? existing.pet_id,
    service_id: body.service_id ?? existing.service_id,
    assigned_user_id: body.assigned_user_id ?? existing.assigned_user_id,
    start_at: body.start_at ?? existing.start_at,
    end_at: body.end_at ?? existing.end_at,
    status: body.status ?? existing.status,
    notes: body.notes ?? existing.notes
  };

  const valid = await validateAppointmentBody(env, merged, appointmentId);
  if (valid.error) {
    return json({ ok: false, error: valid.error, conflict_id: valid.conflict_id }, 400);
  }

  await env.DB.prepare(`
    UPDATE appointments
    SET
      customer_id = ?,
      pet_id = ?,
      service_id = ?,
      assigned_user_id = ?,
      start_at = ?,
      end_at = ?,
      status = ?,
      notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).bind(
    valid.customerId,
    valid.petId,
    valid.serviceId,
    valid.assignedUserId,
    valid.startAt,
    valid.endAt,
    valid.status,
    valid.notes,
    appointmentId,
    COMPANY_ID
  ).run();

  return json({ ok: true, message: "Cita actualizada correctamente" });
}

export async function updateAppointmentStatus(request, env, id) {
  const appointmentId = Number(id);
  const body = await readJson(request);
  const status = clean(body.status).toUpperCase();

  if (!VALID_STATUSES.includes(status)) {
    return json({ ok: false, error: "Estado de cita inválido" }, 400);
  }

  const existing = await env.DB.prepare(`
    SELECT id, status
    FROM appointments
    WHERE id = ? AND company_id = ?
    LIMIT 1
  `).bind(appointmentId, COMPANY_ID).first();

  if (!existing) {
    return json({ ok: false, error: "Cita no encontrada" }, 404);
  }

  if (String(existing.status || "").toUpperCase() === "COMPLETED") {
    return json({
      ok: false,
      error: "Una cita completada queda bloqueada y no puede cambiar de estado"
    }, 409);
  }

  await env.DB.prepare(`
    UPDATE appointments
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).bind(status, appointmentId, COMPANY_ID).run();

  return json({
    ok: true,
    message: status === "COMPLETED"
      ? "Cita completada y bloqueada"
      : "Estado actualizado"
  });
}
