import { mercadoPagoGateway } from "./mercadopago";
import { santanderPixGateway } from "./santander/santander.client";
import { getAdminSettings } from "../modules/admin/settings.service";
import type { IMercadoPagoGateway } from "./mercadopago";

export async function getConfiguredPixGateway(): Promise<IMercadoPagoGateway> {
  const settings = await getAdminSettings();
  return settings.paymentProvider === "SANTANDER" ? santanderPixGateway : mercadoPagoGateway;
}

export async function getPaymentForStoredPixId(paymentId: string) {
  if (/^[A-Za-z0-9]{26,35}$/.test(paymentId) && !/^\d+$/.test(paymentId)) {
    try {
      return await santanderPixGateway.getPayment(paymentId);
    } catch {
      return null;
    }
  }

  return mercadoPagoGateway.getPayment(paymentId);
}

export async function cancelStoredPixPayment(paymentId: string): Promise<void> {
  if (/^[A-Za-z0-9]{26,35}$/.test(paymentId) && !/^\d+$/.test(paymentId)) {
    await santanderPixGateway.cancelPayment(paymentId);
    return;
  }
  await mercadoPagoGateway.cancelPayment(paymentId);
}
