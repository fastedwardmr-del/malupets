import { json } from "./utils/response.js";
import { health } from "./routes/health.js";
import { getCompany } from "./routes/companies.js";
import { listCustomers, createCustomer, updateCustomer } from "./routes/customers.js";
import { listPets, createPet, updatePet } from "./routes/pets.js";

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

      const customerEditMatch = path.match(/^\/api\/customers\/(\d+)$/);
      if (customerEditMatch && method === "PUT") {
        return updateCustomer(request, env, customerEditMatch[1]);
      }

      const petEditMatch = path.match(/^\/api\/pets\/(\d+)$/);
      if (petEditMatch && method === "PUT") {
        return updatePet(request, env, petEditMatch[1]);
      }

      return json({ ok: false, error: "Endpoint no encontrado" }, 404);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }
};
