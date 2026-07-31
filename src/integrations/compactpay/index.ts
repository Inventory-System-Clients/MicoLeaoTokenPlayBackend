import { env } from "../../config/env";
import { CompactPayGateway } from "./compactpay.client";
import { MockCompactPayGateway } from "./compactpay.mock";
import type { ICompactPayGateway } from "./compactpay.types";

export const compactPayGateway: ICompactPayGateway = env.COMPACTPAY_MOCK
  ? new MockCompactPayGateway()
  : new CompactPayGateway();

export * from "./compactpay.types";
