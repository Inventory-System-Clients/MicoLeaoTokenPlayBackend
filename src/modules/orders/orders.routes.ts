import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  cancelOrderAsAdmin,
  cancelUserOrder,
  checkoutProductWithCredits,
  checkoutProductWithMoney,
  checkoutProductWithMoneyPix,
  checkoutProductWithPoints,
  getUserOrder,
  listAdminOrders,
  listUserOrders,
  markOrderDelivered,
  syncUserOrderFromMercadoPago,
} from "./orders.service";

const productParamsSchema = z.object({ id: z.string().uuid() });
const orderParamsSchema = z.object({ id: z.string().uuid() });

const orderStatusQuerySchema = z.object({
  payment_id: z.union([z.string(), z.number()]).optional(),
  collection_id: z.union([z.string(), z.number()]).optional(),
});

const adminOrdersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["PENDING_PAYMENT", "AWAITING_DELIVERY", "DELIVERED", "CANCELED", "FAILED"]).optional(),
  paymentMethod: z.enum(["CREDITS", "POINTS", "MONEY"]).optional(),
  productId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minAmountBrl: z.coerce.number().nonnegative().optional(),
  maxAmountBrl: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function ordersRoutes(app: FastifyInstance) {
  app.post("/products/:id/checkout-credits", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = productParamsSchema.parse(request.params);
    const order = await checkoutProductWithCredits(request.user.sub, id);
    return reply.status(201).send(order);
  });

  app.post("/products/:id/checkout-points", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = productParamsSchema.parse(request.params);
    const order = await checkoutProductWithPoints(request.user.sub, id);
    return reply.status(201).send(order);
  });

  app.post("/products/:id/checkout-money", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = productParamsSchema.parse(request.params);
    const order = await checkoutProductWithMoney(request.user.sub, id);
    return reply.status(201).send(order);
  });

  app.post("/products/:id/checkout-money-pix", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = productParamsSchema.parse(request.params);
    const order = await checkoutProductWithMoneyPix(request.user.sub, id);
    return reply.status(201).send(order);
  });

  // "Meus produtos a receber": historico completo de pedidos do usuario.
  app.get("/orders", { onRequest: [app.authenticate] }, async (request, reply) => {
    const orders = await listUserOrders(request.user.sub);
    return reply.status(200).send(orders);
  });

  // Usado pelo frontend para dar polling apos o redirect de volta do checkout em dinheiro.
  app.get("/orders/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = orderParamsSchema.parse(request.params);
    const query = orderStatusQuerySchema.parse(request.query);
    const paymentId = query.payment_id ?? query.collection_id;
    const order = paymentId
      ? await syncUserOrderFromMercadoPago(request.user.sub, id, String(paymentId))
      : await getUserOrder(request.user.sub, id);
    return reply.status(200).send(order);
  });

  app.post("/orders/:id/cancel", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = orderParamsSchema.parse(request.params);
    const order = await cancelUserOrder(request.user.sub, id);
    return reply.status(200).send(order);
  });

  // "Produtos a entregar": fila de pedidos pagos aguardando entrega fisica.
  app.get("/admin/orders", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const query = adminOrdersQuerySchema.parse(request.query);
    const orders = await listAdminOrders(query);
    return reply.status(200).send(orders);
  });

  app.post("/admin/orders/:id/deliver", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = orderParamsSchema.parse(request.params);
    const order = await markOrderDelivered(id);
    return reply.status(200).send(order);
  });

  app.post("/admin/orders/:id/cancel", { onRequest: [app.requireAdmin] }, async (request, reply) => {
    const { id } = orderParamsSchema.parse(request.params);
    const order = await cancelOrderAsAdmin(id);
    return reply.status(200).send(order);
  });
}
