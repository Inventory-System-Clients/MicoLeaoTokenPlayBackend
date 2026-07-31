import { env } from "../../config/env";
import { MercadoPagoGateway } from "./mercadopago.client";
import { MockMercadoPagoGateway } from "./mercadopago.mock";
import type { IMercadoPagoGateway } from "./mercadopago.types";

export const mercadoPagoGateway: IMercadoPagoGateway = env.MP_MOCK
  ? new MockMercadoPagoGateway()
  : new MercadoPagoGateway();

export * from "./mercadopago.types";
