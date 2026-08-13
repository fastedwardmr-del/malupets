import { json, options } from "./utils/response.js";
import { health } from "./routes/health.js";
import { getCompany } from "./routes/companies.js";
import { listCustomers, createCustomer, updateCustomer } from "./routes/customers.js";
import { listPets, createPet, updatePet } from "./routes/pets.js";
import {
  listProducts,
  createProduct,
  updateProduct,
  importProducts,
  uploadProductImage,
  getProductImage
} from "./routes/products.js";
import { listSales, getSale, createSale } from "./routes/sales.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return options();

    try {
      if (path === "/") {
        return json({ app: "Malupets API", version: "0.2.1", status: "online" });
      }

      if (path === "/api/health" && method === "GET") return health(request, env);
      if (path === "/api/company" && method === "GET") return getCompany(request, env);

      // CLIENTES
      if (path === "/api/customers" && method === "GET") return listCustomers(request, env);
      if (path === "/api/customers" && method === "POST") return createCustomer(request, env);

      const customerMatch = path.match(/^\/api\/customers\/(\d+)$/);
      if (customerMatch && method === "PUT") {
        return updateCustomer(request, env, customerMatch[1]);
      }

      // MASCOTAS
      if (path === "/api/pets" && method === "GET") return listPets(request, env);
      if (path === "/api/pets" && method === "POST") return createPet(request, env);

      const petMatch = path.match(/^\/api\/pets\/(\d+)$/);
      if (petMatch && method === "PUT") {
        return updatePet(request, env, petMatch[1]);
      }

      // PRODUCTOS
      if (path === "/api/products" && method === "GET") return listProducts(request, env);
      if (path === "/api/products" && method === "POST") return createProduct(request, env);
      if (path === "/api/products/import" && method === "POST") return importProducts(request, env);

      const productImageGetMatch = path.match(/^\/api\/products\/image\/(.+)$/);
      if (productImageGetMatch && method === "GET") {
        return getProductImage(request, env, productImageGetMatch[1]);
      }

      const productImageUploadMatch = path.match(/^\/api\/products\/(\d+)\/image$/);
      if (productImageUploadMatch && method === "POST") {
        return uploadProductImage(request, env, productImageUploadMatch[1]);
      }

      const productMatch = path.match(/^\/api\/products\/(\d+)$/);
      if (productMatch && method === "PUT") {
        return updateProduct(request, env, productMatch[1]);
      }

      // VENTAS
      if (path === "/api/sales" && method === "GET") return listSales(request, env);
      if (path === "/api/sales" && method === "POST") return createSale(request, env);

      const saleMatch = path.match(/^\/api\/sales\/(\d+)$/);
      if (saleMatch && method === "GET") {
        return getSale(request, env, saleMatch[1]);
      }

      return json({ ok: false, error: "Endpoint no encontrado" }, 404);
    } catch (error) {
      console.error(error);
      return json({
        ok: false,
        error: error?.message || "Error interno del servidor"
      }, 500);
    }
  }
};
