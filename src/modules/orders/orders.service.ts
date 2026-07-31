import type { Prisma, ProductOrder } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/http-error";
import { mercadoPagoGateway } from "../../integrations/mercadopago";
import { cancelStoredPixPayment, getConfiguredPixGateway, getPaymentForStoredPixId } from "../../integrations/payments";

type TransactionClient = Prisma.TransactionClient;

export type AdminOrdersFilters = {
  search?: string;
  status?: ProductOrder["status"];
  paymentMethod?: ProductOrder["paymentMethod"];
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmountBrl?: number;
  maxAmountBrl?: number;
  limit?: number;
};

function parseAdminOrderDateRange(filters: AdminOrdersFilters) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 6);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000`) : defaultFrom;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : now;

  return { from, to };
}

async function getPurchasableProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.active) {
    throw new NotFoundError("Produto nao encontrado");
  }
  return product;
}

export async function checkoutProductWithCredits(userId: string, productId: string): Promise<ProductOrder> {
  const product = await getPurchasableProduct(productId);
  if (!product.priceCredits) {
    throw new BadRequestError("Este produto nao pode ser comprado com fichas");
  }
  const priceCredits = product.priceCredits;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.creditBalance < priceCredits) {
      throw new BadRequestError("Saldo de fichas insuficiente");
    }

    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { decrement: priceCredits } },
    });

    return tx.productOrder.create({
      data: {
        userId,
        productId,
        productName: product.name,
        paymentMethod: "CREDITS",
        creditsSpent: priceCredits,
        status: "AWAITING_DELIVERY",
      },
    });
  });
}

export async function checkoutProductWithPoints(userId: string, productId: string): Promise<ProductOrder> {
  const product = await getPurchasableProduct(productId);
  if (!product.pricePoints) {
    throw new BadRequestError("Este produto nao pode ser comprado com pontos");
  }
  const pricePoints = product.pricePoints;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.pointsBalance < pricePoints) {
      throw new BadRequestError("Saldo de pontos insuficiente");
    }

    await tx.user.update({
      where: { id: userId },
      data: { pointsBalance: { decrement: pricePoints } },
    });

    return tx.productOrder.create({
      data: {
        userId,
        productId,
        productName: product.name,
        paymentMethod: "POINTS",
        pointsSpent: pricePoints,
        status: "AWAITING_DELIVERY",
      },
    });
  });
}

export async function checkoutProductWithMoney(userId: string, productId: string): Promise<ProductOrder> {
  const [user, product] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    getPurchasableProduct(productId),
  ]);
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }
  const cardPriceBrl = product.cardPriceBrl ?? product.priceBrl;
  if (!cardPriceBrl) {
    throw new BadRequestError("Este produto nao pode ser comprado com cartao");
  }

  const amountBrl = Number(cardPriceBrl);

  const order = await prisma.productOrder.create({
    data: {
      userId,
      productId,
      productName: product.name,
      paymentMethod: "MONEY",
      amountBrl,
      status: "PENDING_PAYMENT",
    },
  });

  const preference = await mercadoPagoGateway.createPreference({
    title: `Agarra Mais - ${product.name}`,
    amountBrl,
    externalReference: order.id,
    payerEmail: user.email,
    payerName: user.name,
  });

  return prisma.productOrder.update({
    where: { id: order.id },
    data: {
      checkoutUrl: preference.checkoutUrl,
      mpPreferenceId: preference.preferenceId,
    },
  });
}

export type PixOrderCheckout = ProductOrder & {
  pixQrCode: string;
  pixQrCodeBase64: string;
};

export async function checkoutProductWithMoneyPix(userId: string, productId: string): Promise<PixOrderCheckout> {
  const [user, product] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    getPurchasableProduct(productId),
  ]);
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }
  if (!product.priceBrl) {
    throw new BadRequestError("Este produto nao pode ser comprado com dinheiro");
  }

  const amountBrl = Number(product.priceBrl);

  const order = await prisma.productOrder.create({
    data: {
      userId,
      productId,
      productName: product.name,
      paymentMethod: "MONEY",
      amountBrl,
      status: "PENDING_PAYMENT",
    },
  });

  const pixGateway = await getConfiguredPixGateway();
  const pix = await pixGateway.createPixPayment({
    title: `Agarra Mais - ${product.name}`,
    amountBrl,
    externalReference: order.id,
    payerEmail: user.email,
    payerName: user.name,
  });

  const updated = await prisma.productOrder.update({
    where: { id: order.id },
    data: { mpPaymentId: pix.paymentId },
  });

  return { ...updated, pixQrCode: pix.qrCode, pixQrCodeBase64: pix.qrCodeBase64 };
}

async function approveOrderPayment(
  tx: TransactionClient,
  order: ProductOrder,
  mpPaymentId?: string,
): Promise<void> {
  await tx.productOrder.update({
    where: { id: order.id },
    data: { status: "AWAITING_DELIVERY", mpPaymentId },
  });
}

/** Espelha handleMercadoPagoPaymentUpdate do modulo transactions, mas para pedidos de produto pagos em dinheiro. */
export async function handleMercadoPagoPaymentUpdateForOrders(paymentId: string): Promise<void> {
  const payment = await getPaymentForStoredPixId(paymentId);
  if (!payment || !payment.externalReference) return;

  const order = await prisma.productOrder.findUnique({ where: { id: payment.externalReference } });
  if (!order || order.status !== "PENDING_PAYMENT") return;

  if (payment.status === "approved") {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.productOrder.findUnique({ where: { id: order.id } });
      if (!locked || locked.status !== "PENDING_PAYMENT") return;
      await approveOrderPayment(tx, locked, payment.id);
    });
    return;
  }

  if (payment.status === "rejected" || payment.status === "canceled") {
    await prisma.productOrder.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "FAILED", mpPaymentId: payment.id },
    });
  }
}

export async function handleMercadoPagoMerchantOrderUpdateForOrders(merchantOrderId: string): Promise<void> {
  const paymentIds = await mercadoPagoGateway.getMerchantOrderPaymentIds(merchantOrderId);
  await Promise.all(paymentIds.map((paymentId) => handleMercadoPagoPaymentUpdateForOrders(paymentId)));
}

export async function syncUserOrderFromMercadoPago(
  userId: string,
  orderId: string,
  paymentId?: string,
): Promise<ProductOrder> {
  const order = await prisma.productOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) {
    throw new NotFoundError("Pedido nao encontrado");
  }

  const effectivePaymentId = paymentId || order.mpPaymentId || undefined;

  if (!effectivePaymentId || order.status !== "PENDING_PAYMENT") {
    return order;
  }

  const payment = await getPaymentForStoredPixId(effectivePaymentId);
  if (!payment || payment.externalReference !== order.id) {
    return order;
  }

  if (payment.status === "approved") {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.productOrder.findUnique({ where: { id: order.id } });
      if (!locked || locked.status !== "PENDING_PAYMENT") return;
      await approveOrderPayment(tx, locked, payment.id);
    });
  }

  if (payment.status === "rejected" || payment.status === "canceled") {
    await prisma.productOrder.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "FAILED", mpPaymentId: payment.id },
    });
  }

  return prisma.productOrder.findUniqueOrThrow({ where: { id: order.id } });
}

export async function cancelUserOrder(userId: string, orderId: string): Promise<ProductOrder> {
  const order = await prisma.productOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) {
    throw new NotFoundError("Pedido nao encontrado");
  }
  if (order.status !== "PENDING_PAYMENT") {
    return order;
  }

  if (order.mpPaymentId) {
    await cancelStoredPixPayment(order.mpPaymentId);
  }

  return prisma.productOrder.update({
    where: { id: order.id },
    data: { status: "FAILED" },
  });
}

export async function listUserOrders(userId: string) {
  return prisma.productOrder.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { id: true, imageUrl: true } } },
  });
}

export async function getUserOrder(userId: string, orderId: string) {
  const order = await prisma.productOrder.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) {
    throw new NotFoundError("Pedido nao encontrado");
  }
  if (order.status === "PENDING_PAYMENT" && order.mpPaymentId) {
    return syncUserOrderFromMercadoPago(userId, orderId, order.mpPaymentId);
  }
  return order;
}

export async function listAdminOrders(filters: AdminOrdersFilters = {}) {
  const { from, to } = parseAdminOrderDateRange(filters);
  const search = filters.search?.trim();
  const where: Prisma.ProductOrderWhereInput = {
    createdAt: { gte: from, lte: to },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.minAmountBrl !== undefined || filters.maxAmountBrl !== undefined
      ? {
          amountBrl: {
            ...(filters.minAmountBrl !== undefined ? { gte: filters.minAmountBrl } : {}),
            ...(filters.maxAmountBrl !== undefined ? { lte: filters.maxAmountBrl } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { productName: { contains: search, mode: "insensitive" } },
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  return prisma.productOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 100,
    include: {
      user: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true, imageUrl: true } },
    },
  });
}

/** "Produtos a entregar" no admin: pedidos pagos aguardando entrega fisica. */
export async function markOrderDelivered(orderId: string) {
  const order = await prisma.productOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new NotFoundError("Pedido nao encontrado");
  }
  if (order.status !== "AWAITING_DELIVERY") {
    throw new ConflictError("Pedido nao esta aguardando entrega");
  }

  return prisma.productOrder.update({
    where: { id: orderId },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
}

/** Cancelamento pelo admin: estorna fichas/pontos gastos automaticamente. */
export async function cancelOrderAsAdmin(orderId: string) {
  const order = await prisma.productOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new NotFoundError("Pedido nao encontrado");
  }
  if (order.status === "DELIVERED" || order.status === "CANCELED") {
    throw new ConflictError("Pedido ja foi entregue ou cancelado");
  }

  if (order.status === "PENDING_PAYMENT" && order.mpPaymentId) {
    await cancelStoredPixPayment(order.mpPaymentId);
  }

  return prisma.$transaction(async (tx) => {
    if (order.creditsSpent > 0 || order.pointsSpent > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: {
          creditBalance: { increment: order.creditsSpent },
          pointsBalance: { increment: order.pointsSpent },
        },
      });
    }

    return tx.productOrder.update({
      where: { id: orderId },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
  });
}
