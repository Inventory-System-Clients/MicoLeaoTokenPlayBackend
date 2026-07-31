import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createProduct, deleteProduct, listActiveProducts, listAllProducts, updateProduct } from "./products.service";

const priceFieldsSchema = {
  priceCredits: z.number().int().positive().nullable().optional(),
  pricePoints: z.number().int().positive().nullable().optional(),
  priceBrl: z.number().positive().nullable().optional(),
  cardPriceBrl: z.number().positive().nullable().optional(),
};

const productBodySchema = z
  .object({
    name: z.string().min(2),
    description: z.string().max(2000).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    active: z.boolean().default(true),
    ...priceFieldsSchema,
  })
  .refine((data) => Boolean(data.priceCredits) || Boolean(data.pricePoints) || Boolean(data.priceBrl) || Boolean(data.cardPriceBrl), {
    message: "Informe ao menos um preco: fichas, pontos ou reais",
  });

const productUpdateBodySchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
  ...priceFieldsSchema,
});

const productParamsSchema = z.object({ id: z.string().uuid() });

export async function productsRoutes(app: FastifyInstance) {
  // Vitrine da loja de produtos: qualquer usuario autenticado ve so os ativos.
  app.get("/products", { onRequest: [app.authenticate] }, async (_request, reply) => {
    const products = await listActiveProducts();
    return reply.status(200).send(products);
  });

  app.get("/admin/products", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const products = await listAllProducts();
    return reply.status(200).send(products);
  });

  app.post("/admin/products", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const body = productBodySchema.parse(request.body);
    const created = await createProduct(body);
    return reply.status(201).send(created);
  });

  app.put("/admin/products/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = productParamsSchema.parse(request.params);
    const body = productUpdateBodySchema.parse(request.body);
    const updated = await updateProduct(id, body);
    return reply.status(200).send(updated);
  });

  app.delete("/admin/products/:id", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = productParamsSchema.parse(request.params);
    await deleteProduct(id);
    return reply.status(204).send();
  });
}
