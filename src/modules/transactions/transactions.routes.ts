import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  checkoutCustomCredits,
  checkoutCustomCreditsPix,
  checkoutPackagePix,
  checkoutPackage,
  cancelUserTransaction,
  confirmTransaction,
  failTransaction,
  getUserTransaction,
  handleMercadoPagoMerchantOrderUpdate,
  handleMercadoPagoPaymentUpdate,
  listAdminTransactions,
  listUserTransactions,
  syncUserTransactionFromMercadoPago,
} from "./transactions.service";
import {
  handleMercadoPagoMerchantOrderUpdateForOrders,
  handleMercadoPagoPaymentUpdateForOrders,
} from "../orders/orders.service";

const checkoutBodySchema = z.object({
  packageId: z.string().uuid(),
});

const checkoutCustomBodySchema = z.object({
  credits: z.number().int().positive().max(10000),
});

const checkoutPixBodySchema = z
  .object({
    packageId: z.string().uuid().optional(),
    credits: z.number().int().positive().max(10000).optional(),
  })
  .refine((data) => Boolean(data.packageId) !== Boolean(data.credits), {
    message: "Informe packageId ou credits",
  });

const transactionParamsSchema = z.object({ id: z.string().uuid() });

const transactionStatusQuerySchema = z.object({
  payment_id: z.union([z.string(), z.number()]).optional(),
  collection_id: z.union([z.string(), z.number()]).optional(),
});

const mercadoPagoWebhookQuerySchema = z.object({
  topic: z.string().optional(),
  type: z.string().optional(),
  action: z.string().optional(),
  id: z.string().optional(),
});

const mercadoPagoWebhookBodySchema = z.object({
  type: z.string().optional(),
  action: z.string().optional(),
  data: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
});

export async function transactionsRoutes(app: FastifyInstance) {
  app.post("/transactions/checkout", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { packageId } = checkoutBodySchema.parse(request.body);
    const transaction = await checkoutPackage(request.user.sub, packageId);
    return reply.status(201).send(transaction);
  });

  app.post("/transactions/checkout-custom", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { credits } = checkoutCustomBodySchema.parse(request.body);
    const transaction = await checkoutCustomCredits(request.user.sub, credits);
    return reply.status(201).send(transaction);
  });

  app.post("/transactions/checkout-pix", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = checkoutPixBodySchema.parse(request.body);
    const transaction = body.packageId
      ? await checkoutPackagePix(request.user.sub, body.packageId)
      : await checkoutCustomCreditsPix(request.user.sub, body.credits!);
    return reply.status(201).send(transaction);
  });

  app.get("/transactions", { onRequest: [app.authenticate] }, async (request, reply) => {
    const transactions = await listUserTransactions(request.user.sub);
    return reply.status(200).send(transactions);
  });

  app.get("/admin/transactions", { onRequest: [app.requireAdmin] }, async (_request, reply) => {
    const transactions = await listAdminTransactions();
    return reply.status(200).send(transactions);
  });

  // Usado pelo frontend para dar polling apos o redirect de volta do checkout.
  app.get("/transactions/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = transactionParamsSchema.parse(request.params);
    const query = transactionStatusQuerySchema.parse(request.query);
    const paymentId = query.payment_id ?? query.collection_id;
    const transaction = paymentId
      ? await syncUserTransactionFromMercadoPago(request.user.sub, id, String(paymentId))
      : await getUserTransaction(request.user.sub, id);
    return reply.status(200).send(transaction);
  });

  app.post("/transactions/:id/cancel", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = transactionParamsSchema.parse(request.params);
    const transaction = await cancelUserTransaction(request.user.sub, id);
    return reply.status(200).send(transaction);
  });

  async function processMercadoPagoWebhook(queryInput: unknown, bodyInput: unknown) {
    const query = mercadoPagoWebhookQuerySchema.parse(queryInput);
    const body = mercadoPagoWebhookBodySchema.parse(bodyInput ?? {});

    const topic = query.topic || query.type || query.action || body.type || body.action || "";
    const resourceId = query.id || (body.data?.id ? String(body.data.id) : undefined);

    if (!resourceId) return;

    if (topic.includes("merchant_order")) {
      await Promise.all([
        handleMercadoPagoMerchantOrderUpdate(resourceId),
        handleMercadoPagoMerchantOrderUpdateForOrders(resourceId),
      ]);
      return;
    }

    if (topic.includes("payment")) {
      // Um pagamento pode ser de uma compra de fichas (Transaction) ou de um
      // pedido de produto (ProductOrder) - cada handler ignora silenciosamente
      // se o external_reference nao pertencer a sua tabela.
      await Promise.all([
        handleMercadoPagoPaymentUpdate(resourceId),
        handleMercadoPagoPaymentUpdateForOrders(resourceId),
      ]);
    }
  }

  // Webhook publico do Mercado Pago (sem autenticacao - eles chamam direto).
  // Aceita POST (webhooks atuais) e GET (IPN/formatos antigos). Respondemos
  // rapido e processamos em background para evitar timeout/retentativas.
  app.post("/webhooks/mercadopago", async (request, reply) => {
    reply.status(200).send({ received: true });

    processMercadoPagoWebhook(request.query, request.body).catch((error) => {
      app.log.error(error, "Falha ao processar webhook do Mercado Pago");
    });
  });

  app.get("/webhooks/mercadopago", async (request, reply) => {
    reply.status(200).send({ received: true });

    processMercadoPagoWebhook(request.query, {}).catch((error) => {
      app.log.error(error, "Falha ao processar IPN do Mercado Pago");
    });
  });

  // Fallback manual (admin/testes) - so necessario quando MP_MOCK=true, ja
  // que nesse modo nenhum webhook real chega.
  app.post(
    "/admin/transactions/:id/confirm",
    { onRequest: [app.requireAdmin] },
    async (request, reply) => {
      const { id } = transactionParamsSchema.parse(request.params);
      const result = await confirmTransaction(id);
      return reply.status(200).send(result);
    },
  );

  app.post(
    "/admin/transactions/:id/fail",
    { onRequest: [app.requireAdmin] },
    async (request, reply) => {
      const { id } = transactionParamsSchema.parse(request.params);
      const result = await failTransaction(id);
      return reply.status(200).send(result);
    },
  );
}
