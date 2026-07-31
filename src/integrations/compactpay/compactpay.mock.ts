import { randomUUID } from "node:crypto";
import type {
  CompactPayDispenseParams,
  CompactPayDispenseResult,
  CompactPayMachineSummary,
  ICompactPayGateway,
} from "./compactpay.types";

/**
 * Gateway simulado da CompactPay, usado enquanto as credenciais reais da API
 * nao estao configuradas (COMPACTPAY_MOCK=true). Sempre confirma o pulso.
 */
export class MockCompactPayGateway implements ICompactPayGateway {
  async firePulses(params: CompactPayDispenseParams): Promise<CompactPayDispenseResult> {
    // eslint-disable-next-line no-console
    console.log(
      `[CompactPay:mock] telemetryId=${params.telemetryId} pulses=${params.pulses} correlationId=${params.correlationId}`,
    );
    return { ok: true, commandId: randomUUID(), pulseStatus: "pulso_confirmado" };
  }

  async listMachines(): Promise<CompactPayMachineSummary[]> {
    return [
      {
        telemetryId: "CP0001",
        name: "Maquina Mock 01",
        location: "Ambiente de testes",
        online: true,
        clienteId: null,
        clienteNome: null,
      },
    ];
  }
}
