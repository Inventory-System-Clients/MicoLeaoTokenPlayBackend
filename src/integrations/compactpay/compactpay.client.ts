import { env } from "../../config/env";
import type {
  CompactPayDispenseParams,
  CompactPayDispenseResult,
  CompactPayMachineSummary,
  ICompactPayGateway,
} from "./compactpay.types";

type LoginResponse = { access_token: string; token_type: string };

type CreditoDigitalResponse = {
  ok: boolean;
  maquina_id: string;
  pulsos: number;
  topic: string | null;
  payload: string;
  command_id: string;
  pulse_status: string;
  referencia_externa: string | null;
  data_hora: string;
};

type CreditoTesteResponse = {
  ok: boolean;
  machine_id: string;
  topic: string | null;
  payload: string;
  valor: number;
  command_id: string;
  pulse_status: string;
};

type MaquinaOutResponse = {
  id_hardware: string;
  nome: string | null;
  localizacao: string | null;
  status_online: boolean;
  cliente_id: number | null;
  cliente_nome: string | null;
};

export class CompactPayRequestError extends Error {
  constructor(
    public readonly upstreamStatusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CompactPayRequestError";
  }
}

/**
 * Cliente HTTP real da CompactPay.
 *
 * Autenticacao: POST /login (OAuth2 password grant, form-urlencoded) - a conta
 * usada aqui precisa ser um Usuario cadastrado na CompactPay com visibilidade
 * sobre as maquinas jogadas (role=admin, ou role de cliente dono das maquinas).
 *
 * Disparo de pulsos: POST /pagamentos/creditos-digitais { maquina_id, pulsos,
 * origem, referencia_externa }. Esse endpoint foi adicionado ao backend da
 * CompactPay (app/api/v1/endpoints/pagamentos.py) especificamente para sistemas
 * externos que ja cobraram o cliente por fora (nosso Pix, nosso saldo de
 * creditos): ele dispara os pulsos exatos via MQTT e NAO conta como faturamento
 * da CompactPay (conta_faturamento=False), evitando duplicar receita nos
 * relatorios dela. A chamada e sincrona: o backend da CompactPay so responde
 * depois de aguardar (ou dar timeout) a confirmacao do pulso pela placa.
 *
 * Listagem de maquinas: GET /maquinas - usado pelo admin do Agarra Mais para
 * escolher o telemetryId certo (o id_hardware real da CompactPay) na hora de
 * cadastrar uma Machine aqui, em vez de digitar as cegas.
 */
export class CompactPayGateway implements ICompactPayGateway {
  private token: string | null = null;

  private readonly apiUrl = env.COMPACTPAY_API_URL;

  // env.ts ja garante (na inicializacao do processo) que email/senha existem
  // quando COMPACTPAY_MOCK=false - unico caso em que esta classe e instanciada
  // (ver src/integrations/compactpay/index.ts).
  private readonly email = env.COMPACTPAY_API_EMAIL!;
  private readonly password = env.COMPACTPAY_API_PASSWORD!;

  async firePulses(params: CompactPayDispenseParams): Promise<CompactPayDispenseResult> {
    try {
      const response = await this.authorizedFetch("/pagamentos/creditos-digitais", {
        method: "POST",
        body: JSON.stringify({
          maquina_id: params.telemetryId,
          pulsos: params.pulses,
          origem: "agarramais",
          referencia_externa: params.correlationId,
        }),
      });

      const data = (await response.json()) as CreditoDigitalResponse;

      return {
        ok: data.pulse_status === "pulso_confirmado" || data.pulse_status === "saldo_pendente",
        commandId: data.command_id,
        pulseStatus: data.pulse_status,
      };
    } catch (error) {
      if (error instanceof CompactPayRequestError && error.upstreamStatusCode === 404) {
        return this.firePulsesViaLegacyCreditTest(params);
      }

      throw error;
    }
  }

  private async firePulsesViaLegacyCreditTest(
    params: CompactPayDispenseParams,
  ): Promise<CompactPayDispenseResult> {
    const response = await this.authorizedFetch(`/maquinas/${params.telemetryId}/credito-teste`, {
      method: "POST",
      // Fallback para CompactPay antigo, onde ainda nao existe
      // /pagamentos/creditos-digitais. A rota antiga recebe "valor" e a placa
      // converte via configuracao local de valor por pulso.
      body: JSON.stringify({ valor: params.pulses }),
    });

    const data = (await response.json()) as CreditoTesteResponse;

    return {
      ok: data.pulse_status === "pulso_confirmado" || data.pulse_status === "saldo_pendente",
      commandId: data.command_id,
      pulseStatus: data.pulse_status,
    };
  }

  async listMachines(): Promise<CompactPayMachineSummary[]> {
    const response = await this.authorizedFetch("/maquinas", { method: "GET" });
    const data = (await response.json()) as MaquinaOutResponse[];

    return data.map((machine) => ({
      telemetryId: machine.id_hardware,
      name: machine.nome,
      location: machine.localizacao,
      online: machine.status_online,
      clienteId: machine.cliente_id,
      clienteNome: machine.cliente_nome,
    }));
  }

  private async authorizedFetch(
    path: string,
    init: { method: "GET" | "POST"; body?: string },
    isRetry = false,
  ): Promise<Response> {
    const token = await this.getToken();

    const response = await fetch(`${this.apiUrl}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: init.body,
    });

    if (response.status === 401 && !isRetry) {
      this.token = null;
      return this.authorizedFetch(path, init, true);
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new CompactPayRequestError(
        response.status,
        `CompactPay: requisicao falhou (${response.status}) ${detail}`,
      );
    }

    return response;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;

    const body = new URLSearchParams({
      username: this.email,
      password: this.password,
    });

    const response = await fetch(`${this.apiUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      throw new Error(`CompactPay: falha na autenticacao (${response.status})`);
    }

    const data = (await response.json()) as LoginResponse;
    this.token = data.access_token;
    return this.token;
  }
}
