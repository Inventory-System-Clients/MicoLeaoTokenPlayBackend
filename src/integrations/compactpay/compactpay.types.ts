export type CompactPayDispenseParams = {
  /** Machine.telemetryId - identificador da placa na CompactPay (maquina.id_hardware). */
  telemetryId: string;
  /** Numero exato de pulsos fisicos a disparar na placa. */
  pulses: number;
  /**
   * Id de correlacao gerado por nos (ex: id interno da jogada), enviado como
   * `referencia_externa` para a CompactPay. NAO e o command_id final: a
   * CompactPay gera o seu proprio command_id internamente e o devolve na resposta.
   */
  correlationId: string;
};

export type CompactPayDispenseResult = {
  ok: boolean;
  /** command_id gerado pela CompactPay para este disparo (usado para rastrear no MQTT). */
  commandId: string;
  /** Status de confirmacao do pulso reportado pela placa (ex: "pulso_confirmado", "falha_timeout"). */
  pulseStatus: string;
};

export type CompactPayMachineSummary = {
  /** id_hardware na CompactPay - o mesmo valor a usar em Machine.telemetryId. */
  telemetryId: string;
  name: string | null;
  location: string | null;
  online: boolean;
  clienteId: number | null;
  clienteNome: string | null;
};

export interface ICompactPayGateway {
  firePulses(params: CompactPayDispenseParams): Promise<CompactPayDispenseResult>;
  /** Lista as maquinas ja cadastradas na CompactPay, para o admin escolher o telemetryId certo. */
  listMachines(): Promise<CompactPayMachineSummary[]>;
}
