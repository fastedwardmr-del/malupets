import { json, readJson } from "../utils/response.js";

export async function listPets(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT pets.*, customers.full_name AS owner
    FROM pets
    LEFT JOIN customers ON customers.id = pets.customer_id
    WHERE pets.company_id = 1 AND pets.is_active = 1
    ORDER BY pets.created_at DESC
  `).all();
  return json(results);
}

export async function createPet(request, env) {
  const body = await readJson(request);
  if (!body.customer_id) return json({ ok: false, error: "El cliente es obligatorio" }, 400);
  if (!body.name) return json({ ok: false, error: "El nombre de la mascota es obligatorio" }, 400);

  const result = await env.DB.prepare(`
    INSERT INTO pets (
      company_id, customer_id, name, species, breed, sex,
      color, birth_date, weight, photo_url, microchip,
      allergies, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    1,
    body.customer_id,
    body.name,
    body.species || "",
    body.breed || "",
    body.sex || "",
    body.color || "",
    body.birth_date || "",
    body.weight || null,
    body.photo_url || "",
    body.microchip || "",
    body.allergies || "",
    body.notes || ""
  ).run();

  return json({ ok: true, message: "Mascota creada correctamente", id: result.meta.last_row_id }, 201);
}
export async function updatePet(request, env, id) {
  const body = await readJson(request);

  if (!id) return json({ ok: false, error: "ID de mascota requerido" }, 400);
  if (!body.name) return json({ ok: false, error: "El nombre de la mascota es obligatorio" }, 400);

  await env.DB.prepare(`
    UPDATE pets
    SET name = ?, species = ?, breed = ?, sex = ?, color = ?,
        birth_date = ?, weight = ?, photo_url = ?, microchip = ?,
        allergies = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = 1
  `).bind(
    body.name,
    body.species || "",
    body.breed || "",
    body.sex || "",
    body.color || "",
    body.birth_date || "",
    body.weight || null,
    body.photo_url || "",
    body.microchip || "",
    body.allergies || "",
    body.notes || "",
    id
  ).run();

  return json({ ok: true, message: "Mascota actualizada correctamente" });
}