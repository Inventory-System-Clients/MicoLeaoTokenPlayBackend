import { randomUUID } from "node:crypto";
import type {
  CreatePreferenceParams,
  CreatePreferenceResult,
  IMercadoPagoGateway,
  MercadoPagoPayment,
  CreatePixPaymentParams,
  CreatePixPaymentResult,
} from "./mercadopago.types";

/**
 * Gateway simulado, usado enquanto MP_ACCESS_TOKEN nao esta configurado
 * (MP_MOCK=true). Gera uma preference falsa; nao ha webhook real chegando
 * nesse modo, entao use POST /admin/transactions/:id/confirm para simular a
 * aprovacao manualmente durante o desenvolvimento.
 */
export class MockMercadoPagoGateway implements IMercadoPagoGateway {
  async createPreference(params: CreatePreferenceParams): Promise<CreatePreferenceResult> {
    return {
      preferenceId: randomUUID(),
      checkoutUrl: `https://mock-checkout.mercadopago.com/${params.externalReference}`,
    };
  }

  async getPayment(_paymentId: string): Promise<MercadoPagoPayment | null> {
    return null;
  }

  async getMerchantOrderPaymentIds(_merchantOrderId: string): Promise<string[]> {
    return [];
  }

  async createPixPayment(params: CreatePixPaymentParams): Promise<CreatePixPaymentResult> {
    return {
      paymentId: randomUUID(),
      qrCode: `MOCK-PIX-${params.externalReference}`,
      qrCodeBase64: "",
    };
  }

  async cancelPayment(_paymentId: string): Promise<void> {}
}
