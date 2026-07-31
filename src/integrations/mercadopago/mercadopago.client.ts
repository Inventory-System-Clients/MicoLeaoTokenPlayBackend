import { env } from "../../config/env";
import type {
  CreatePreferenceParams,
  CreatePreferenceResult,
  CreatePixPaymentParams,
  CreatePixPaymentResult,
  IMercadoPagoGateway,
  MercadoPagoPayment,
  MercadoPagoPaymentStatus,
} from "./mercadopago.types";

type PreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type PaymentResponse = {
  id: number | string;
  status: string;
  status_detail: string | null;
  external_reference: string | null;
  transaction_amount: number | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
};

type MerchantOrderResponse = {
  payments?: Array<{
    id: number | string;
    status?: string;
  }>;
};

function normalizeStatus(rawStatus: string): MercadoPagoPaymentStatus {
  const status = rawStatus.trim().toLowerCase();

  if (status === "approved" || status === "authorized") return "approved";
  if (status === "pending" || status === "in_process" || status === "in_mediation") return "pending";
  if (status === "cancelled" || status === "canceled" || status === "refunded" || status === "charged_back") {
    return "canceled";
  }
  if (status === "rejected") return "rejected";
  return "pending";
}

/**
 * Cliente real do Mercado Pago via Checkout Pro: cria uma "preference" e
 * redireciona o cliente para a pagina hospedada por eles, que ja oferece
 * cartao de credito/debito (com parcelamento) e Pix na mesma tela - sem a
 * gente lidar com dados de cartao (fora do escopo de PCI compliance).
 *
 * O pagamento e confirmado via webhook (ver transactions.routes.ts): a
 * notificacao so traz o ID do pagamento, entao sempre buscamos o pagamento
 * de volta na API deles antes de confirmar credito - nunca confiamos direto
 * no corpo do webhook (mesmo padrao usado no backend da Chincoa/PrimePlush).
 */
export class MercadoPagoGateway implements IMercadoPagoGateway {
  // env.ts ja garante (na inicializacao do processo) que MP_ACCESS_TOKEN
  // existe quando MP_MOCK=false - unico caso em que esta classe e instanciada
  // (ver src/integrations/mercadopago/index.ts).
  private readonly accessToken = env.MP_ACCESS_TOKEN!;

  async createPreference(params: CreatePreferenceParams): Promise<CreatePreferenceResult> {
    const backUrlBase = env.APP_BASE_URL.replace(/\/$/, "");

    const response = await fetch(`${env.MP_API_BASE_URL}/checkout/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        "X-Idempotency-Key": params.externalReference,
      },
      body: JSON.stringify({
        items: [
          {
            title: params.title,
            quantity: 1,
            currency_id: "BRL",
            unit_price: params.amountBrl,
          },
        ],
        external_reference: params.externalReference,
        metadata: { transaction_id: params.externalReference },
        payer: { email: params.payerEmail, name: params.payerName },
        back_urls: {
          success: `${backUrlBase}/checkout/sucesso`,
          pending: `${backUrlBase}/checkout/pendente`,
          failure: `${backUrlBase}/checkout/falha`,
        },
        auto_return: "approved",
        notification_url: `${env.BACKEND_PUBLIC_URL.replace(/\/$/, "")}/webhooks/mercadopago`,
        statement_descriptor: "AGARRA MAIS",
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Mercado Pago: falha ao criar preferencia (${response.status}) ${detail}`);
    }

    const data = (await response.json()) as PreferenceResponse;

    const checkoutUrl = data.init_point;
    if (!checkoutUrl) {
      throw new Error(
        "Mercado Pago: preferencia criada sem URL de producao. Verifique se o MP_ACCESS_TOKEN e de producao (APP_USR-) e nao de teste (TEST-).",
      );
    }

    return {
      preferenceId: data.id,
      checkoutUrl,
    };
  }

  async createPixPayment(params: CreatePixPaymentParams): Promise<CreatePixPaymentResult> {
    const response = await fetch(`${env.MP_API_BASE_URL}/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        "X-Idempotency-Key": `pix-${params.externalReference}`,
      },
      body: JSON.stringify({
        transaction_amount: params.amountBrl,
        description: params.title,
        payment_method_id: "pix",
        external_reference: params.externalReference,
        notification_url: `${env.BACKEND_PUBLIC_URL.replace(/\/$/, "")}/webhooks/mercadopago`,
        metadata: { transaction_id: params.externalReference },
        payer: {
          email: params.payerEmail,
          first_name: params.payerName,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Mercado Pago: falha ao criar Pix (${response.status}) ${detail}`);
    }

    const data = (await response.json()) as PaymentResponse;
    const qrCode = data.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;

    if (!qrCode || !qrCodeBase64) {
      throw new Error("Mercado Pago: pagamento Pix criado sem QR Code");
    }

    return {
      paymentId: String(data.id),
      qrCode,
      qrCodeBase64,
    };
  }

  async getPayment(paymentId: string): Promise<MercadoPagoPayment | null> {
    const response = await fetch(`${env.MP_API_BASE_URL}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Mercado Pago: falha ao consultar pagamento (${response.status}) ${detail}`);
    }

    const data = (await response.json()) as PaymentResponse;

    return {
      id: String(data.id),
      status: normalizeStatus(data.status),
      statusDetail: data.status_detail,
      externalReference: data.external_reference,
      transactionAmount: data.transaction_amount,
    };
  }

  async getMerchantOrderPaymentIds(merchantOrderId: string): Promise<string[]> {
    const response = await fetch(`${env.MP_API_BASE_URL}/merchant_orders/${merchantOrderId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (response.status === 404) return [];

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Mercado Pago: falha ao consultar merchant_order (${response.status}) ${detail}`);
    }

    const data = (await response.json()) as MerchantOrderResponse;
    return (data.payments ?? []).map((payment) => String(payment.id));
  }

  async cancelPayment(paymentId: string): Promise<void> {
    const response = await fetch(`${env.MP_API_BASE_URL}/v1/payments/${paymentId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (response.status === 404) return;

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Mercado Pago: falha ao cancelar pagamento (${response.status}) ${detail}`);
    }
  }
}
