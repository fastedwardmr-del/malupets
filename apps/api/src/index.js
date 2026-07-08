import { json } from "./utils/response.js";
import { health } from "./routes/health.js";
import { getCompany } from "./routes/companies.js";
import { listCustomers, createCustomer } from "./routes/customers.js";
import { listPets, createPet } from "./routes/pets.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return json({ ok: true });

    try {
      if (path === "/") {
        return json({ app: "Malupets API", version: "0.1.0", status: "online" });
      }

      if (path === "/api/health" && method === "GET") return health(request, env);
      if (path === "/api/company" && method === "GET") return getCompany(request, env);

      if (path === "/api/customers" && method === "GET") return listCustomers(request, env);
      if (path === "/api/customers" && method === "POST") return createCustomer(request, env);

      if (path === "/api/pets" && method === "GET") return listPets(request, env);
      if (path === "/api/pets" && method === "POST") return createPet(request, env);

      return json({ ok: false, error: "Endpoint no encontrado" }, 404);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }
};
