import { json } from "./utils/response.js";
import { health } from "./routes/health.js";
import { getCompany } from "./routes/companies.js";
import { listCustomers, createCustomer, updateCustomer } from "./routes/customers.js";
import { listPets, createPet, updatePet } from "./routes/pets.js";
import { listProducts, createProduct, updateProduct, importProducts, uploadProductImage, getProductImage } from "./routes/products.js";
import { listSales, createSale } from "./routes/sales.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return json({ ok: true });

    try {
      if (path === "/") return json({ app: "Malupets API", version: "0.2.0", status: "online" });

      if (path === "/api/health" && method === "GET") return health(request, env);
      if (path === "/api/company" && method === "GET") return getCompany(request, env);

      if (path === "/api/customers" && method === "GET") return listCustomers(request, env);
      if (path === "/api/customers" && method === "POST") return createCustomer(request, env);

      if (path === "/api/pets" && method === "GET") return listPets(request, env);
      if (path === "/api/pets" && method === "POST") return createPet(request, env);

      if (path === "/api/products" && method === "GET") return listProducts(request, env);
      if (path === "/api/products" && method === "POST") return createProduct(request, env);
      if (path === "/api/products/import" && method === "POST") return importProducts(request, env);

      const productImageMatch = path.match(/^\/api\/products\/image\/(.+)$/);
      if (productImageMatch && method === "GET") return getProductImage(request, env, productImageMatch[1]);

      const productEditMatch = path.match(/^\/api\/products\/(\d+)$/);
      if (productEditMatch && method === "PUT") return updateProduct(request, env, productEditMatch[1]);

      const productUploadMatch = path.match(/^\/api\/products\/(\d+)\/image$/);
      if (productUploadMatch && method === "POST") return uploadProductImage(request, env, productUploadMatch[1]);

      if (path === "/api/sales" && method === "GET") return listSales(request, env);
      if (path === "/api/sales" && method === "POST") return createSale(request, env);

      const customerEditMatch = path.match(/^\/api\/customers\/(\d+)$/);
      if (customerEditMatch && method === "PUT") return updateCustomer(request, env, customerEditMatch[1]);

      const petEditMatch = path.match(/^\/api\/pets\/(\d+)$/);
      if (petEditMatch && method === "PUT") return updatePet(request, env, petEditMatch[1]);

      return json({ ok: false, error: "Endpoint no encontrado" }, 404);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }
};
