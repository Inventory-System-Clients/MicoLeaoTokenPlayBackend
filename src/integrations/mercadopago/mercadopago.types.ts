export type CreatePreferenceParams = {
  title: string;
  amountBrl: number;
  /** Usado para casar o pagamento de volta com a nossa Transaction (external_reference). */
  externalReference: string;
  payerEmail: string;
  payerName: string;
};

export type CreatePreferenceResult = {
  preferenceId: string;
  /** URL da pagina hospedada pelo Mercado Pago (cartao + Pix + parcelamento). */
  checkoutUrl: string;
};

export type MercadoPagoPaymentStatus = "approved" | "pending" | "rejected" | "canceled";

export type MercadoPagoPayment = {
  id: string;
  status: MercadoPagoPaymentStatus;
  statusDetail: string | null;
  externalReference: string | null;
  transactionAmount: number | null;
};

export type CreatePixPaymentParams = {
  title: string;
  amountBrl: number;
  externalReference: string;
  payerEmail: string;
  payerName: string;
};

export type CreatePixPaymentResult = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
};

export interface IMercadoPagoGateway {
  createPreference(params: CreatePreferenceParams): Promise<CreatePreferenceResult>;
  createPixPayment(params: CreatePixPaymentParams): Promise<CreatePixPaymentResult>;
  getPayment(paymentId: string): Promise<MercadoPagoPayment | null>;
  getMerchantOrderPaymentIds(merchantOrderId: string): Promise<string[]>;
  cancelPayment(paymentId: string): Promise<void>;
}
