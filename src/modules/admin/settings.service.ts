import { prisma } from "../../utils/prisma";

const TOKEN_VALUE_KEY = "token_value_brl";
const TOKEN_BUNDLE_AMOUNT_KEY = "token_bundle_amount_brl";
const TOKEN_BUNDLE_CREDITS_KEY = "token_bundle_credits";
const POINTS_PER_CREDIT_KEY = "points_per_credit";
const PAYMENT_PROVIDER_KEY = "payment_provider";
const SANTANDER_ENVIRONMENT_KEY = "santander_environment";
const SANTANDER_BASE_URL_KEY = "santander_base_url";
const SANTANDER_PIX_BASE_URL_KEY = "santander_pix_base_url";
const SANTANDER_CLIENT_ID_KEY = "santander_client_id";
const SANTANDER_CLIENT_SECRET_KEY = "santander_client_secret";
const SANTANDER_CERTIFICATE_PEM_KEY = "santander_certificate_pem";
const SANTANDER_PRIVATE_KEY_PEM_KEY = "santander_private_key_pem";
const SANTANDER_PFX_BASE64_KEY = "santander_pfx_base64";
const SANTANDER_PFX_PASSPHRASE_KEY = "santander_pfx_passphrase";
const SANTANDER_PIX_KEY_KEY = "santander_pix_key";
const DEFAULT_TOKEN_VALUE_BRL = "1.00";
const DEFAULT_TOKEN_BUNDLE_AMOUNT_BRL = "1.00";
const DEFAULT_TOKEN_BUNDLE_CREDITS = "1";
const DEFAULT_POINTS_PER_CREDIT = "0";
const DEFAULT_PAYMENT_PROVIDER = "MERCADO_PAGO";
const DEFAULT_SANTANDER_ENVIRONMENT = "SANDBOX";
const DEFAULT_SANTANDER_BASE_URL = "https://trust-sandbox.api.santander.com.br";
const DEFAULT_SANTANDER_PIX_BASE_URL = "https://pix.santander.com.br/api/v1/sandbox";

export type PaymentProvider = "MERCADO_PAGO" | "SANTANDER";
export type SantanderEnvironment = "SANDBOX" | "PRODUCTION";

export type AdminSettings = {
  tokenBundleAmountBrl: string;
  tokenBundleCredits: number;
  tokenValueBrl: string;
  pointsPerCredit: number;
  paymentProvider: PaymentProvider;
  santanderEnvironment: SantanderEnvironment;
  santanderBaseUrl: string;
  santanderPixBaseUrl: string;
  santanderClientIdSet: boolean;
  santanderClientSecretSet: boolean;
  santanderCertificatePemSet: boolean;
  santanderPrivateKeyPemSet: boolean;
  santanderPfxSet: boolean;
  santanderPixKeySet: boolean;
};

export type SantanderPaymentSettings = {
  environment: SantanderEnvironment;
  baseUrl: string;
  pixBaseUrl: string;
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
  pfxBase64: string;
  pfxPassphrase: string;
  pixKey: string;
};

export async function getAdminSettings(): Promise<AdminSettings> {
  const [
    bundleAmount,
    bundleCredits,
    legacyTokenValue,
    pointsPerCredit,
    paymentProvider,
    santanderEnvironment,
    santanderBaseUrl,
    santanderPixBaseUrl,
    santanderClientId,
    santanderClientSecret,
    santanderCertificatePem,
    santanderPrivateKeyPem,
    santanderPfxBase64,
    santanderPfxPassphrase,
    santanderPixKey,
  ] = await Promise.all([
    ensureSetting(TOKEN_BUNDLE_AMOUNT_KEY, DEFAULT_TOKEN_BUNDLE_AMOUNT_BRL),
    ensureSetting(TOKEN_BUNDLE_CREDITS_KEY, DEFAULT_TOKEN_BUNDLE_CREDITS),
    ensureSetting(TOKEN_VALUE_KEY, DEFAULT_TOKEN_VALUE_BRL),
    ensureSetting(POINTS_PER_CREDIT_KEY, DEFAULT_POINTS_PER_CREDIT),
    ensureSetting(PAYMENT_PROVIDER_KEY, DEFAULT_PAYMENT_PROVIDER),
    ensureSetting(SANTANDER_ENVIRONMENT_KEY, DEFAULT_SANTANDER_ENVIRONMENT),
    ensureSetting(SANTANDER_BASE_URL_KEY, DEFAULT_SANTANDER_BASE_URL),
    ensureSetting(SANTANDER_PIX_BASE_URL_KEY, DEFAULT_SANTANDER_PIX_BASE_URL),
    ensureSetting(SANTANDER_CLIENT_ID_KEY, ""),
    ensureSetting(SANTANDER_CLIENT_SECRET_KEY, ""),
    ensureSetting(SANTANDER_CERTIFICATE_PEM_KEY, ""),
    ensureSetting(SANTANDER_PRIVATE_KEY_PEM_KEY, ""),
    ensureSetting(SANTANDER_PFX_BASE64_KEY, ""),
    ensureSetting(SANTANDER_PFX_PASSPHRASE_KEY, ""),
    ensureSetting(SANTANDER_PIX_KEY_KEY, ""),
  ]);

  const credits = Math.max(1, Number.parseInt(bundleCredits.value, 10) || 1);
  const amount = Number(bundleAmount.value || legacyTokenValue.value || DEFAULT_TOKEN_VALUE_BRL);
  const unitValue = amount / credits;
  const provider = paymentProvider.value === "SANTANDER" ? "SANTANDER" : "MERCADO_PAGO";
  const environment = santanderEnvironment.value === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";

  return {
    tokenBundleAmountBrl: amount.toFixed(2),
    tokenBundleCredits: credits,
    tokenValueBrl: unitValue.toFixed(2),
    pointsPerCredit: Number(pointsPerCredit.value) || 0,
    paymentProvider: provider,
    santanderEnvironment: environment,
    santanderBaseUrl: santanderBaseUrl.value || DEFAULT_SANTANDER_BASE_URL,
    santanderPixBaseUrl: santanderPixBaseUrl.value || DEFAULT_SANTANDER_PIX_BASE_URL,
    santanderClientIdSet: Boolean(santanderClientId.value),
    santanderClientSecretSet: Boolean(santanderClientSecret.value),
    santanderCertificatePemSet: Boolean(santanderCertificatePem.value),
    santanderPrivateKeyPemSet: Boolean(santanderPrivateKeyPem.value),
    santanderPfxSet: Boolean(santanderPfxBase64.value),
    santanderPixKeySet: Boolean(santanderPixKey.value),
  };
}

export async function getSantanderPaymentSettings(): Promise<SantanderPaymentSettings> {
  const [
    santanderEnvironment,
    santanderBaseUrl,
    santanderPixBaseUrl,
    santanderClientId,
    santanderClientSecret,
    santanderCertificatePem,
    santanderPrivateKeyPem,
    santanderPfxBase64,
    santanderPfxPassphrase,
    santanderPixKey,
  ] = await Promise.all([
    ensureSetting(SANTANDER_ENVIRONMENT_KEY, DEFAULT_SANTANDER_ENVIRONMENT),
    ensureSetting(SANTANDER_BASE_URL_KEY, DEFAULT_SANTANDER_BASE_URL),
    ensureSetting(SANTANDER_PIX_BASE_URL_KEY, DEFAULT_SANTANDER_PIX_BASE_URL),
    ensureSetting(SANTANDER_CLIENT_ID_KEY, ""),
    ensureSetting(SANTANDER_CLIENT_SECRET_KEY, ""),
    ensureSetting(SANTANDER_CERTIFICATE_PEM_KEY, ""),
    ensureSetting(SANTANDER_PRIVATE_KEY_PEM_KEY, ""),
    ensureSetting(SANTANDER_PFX_BASE64_KEY, ""),
    ensureSetting(SANTANDER_PFX_PASSPHRASE_KEY, ""),
    ensureSetting(SANTANDER_PIX_KEY_KEY, ""),
  ]);

  return {
    environment: santanderEnvironment.value === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
    baseUrl: santanderBaseUrl.value || DEFAULT_SANTANDER_BASE_URL,
    pixBaseUrl: santanderPixBaseUrl.value || DEFAULT_SANTANDER_PIX_BASE_URL,
    clientId: santanderClientId.value,
    clientSecret: santanderClientSecret.value,
    certificatePem: santanderCertificatePem.value,
    privateKeyPem: santanderPrivateKeyPem.value,
    pfxBase64: santanderPfxBase64.value,
    pfxPassphrase: santanderPfxPassphrase.value,
    pixKey: santanderPixKey.value,
  };
}

export async function updateAdminSettings(input: {
  tokenBundleAmountBrl?: number;
  tokenBundleCredits?: number;
  tokenValueBrl?: number;
  pointsPerCredit?: number;
  paymentProvider?: PaymentProvider;
  santanderEnvironment?: SantanderEnvironment;
  santanderBaseUrl?: string;
  santanderPixBaseUrl?: string;
  santanderClientId?: string;
  santanderClientSecret?: string;
  santanderCertificatePem?: string;
  santanderPrivateKeyPem?: string;
  santanderPfxBase64?: string;
  santanderPfxPassphrase?: string;
  santanderPixKey?: string;
}): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const amount = input.tokenBundleAmountBrl ?? input.tokenValueBrl ?? Number(current.tokenBundleAmountBrl);
  const credits = input.tokenBundleCredits ?? current.tokenBundleCredits;
  const unitValue = amount / credits;
  const pointsPerCredit = input.pointsPerCredit ?? current.pointsPerCredit;

  await Promise.all([
    setSetting(TOKEN_BUNDLE_AMOUNT_KEY, amount.toFixed(2)),
    setSetting(TOKEN_BUNDLE_CREDITS_KEY, String(credits)),
    setSetting(TOKEN_VALUE_KEY, unitValue.toFixed(2)),
    setSetting(POINTS_PER_CREDIT_KEY, String(pointsPerCredit)),
    ...(input.paymentProvider ? [setSetting(PAYMENT_PROVIDER_KEY, input.paymentProvider)] : []),
    ...(input.santanderEnvironment ? [setSetting(SANTANDER_ENVIRONMENT_KEY, input.santanderEnvironment)] : []),
    ...(input.santanderBaseUrl !== undefined ? [setSetting(SANTANDER_BASE_URL_KEY, input.santanderBaseUrl.trim())] : []),
    ...(input.santanderPixBaseUrl !== undefined
      ? [setSetting(SANTANDER_PIX_BASE_URL_KEY, input.santanderPixBaseUrl.trim())]
      : []),
    ...(input.santanderClientId?.trim() ? [setSetting(SANTANDER_CLIENT_ID_KEY, input.santanderClientId.trim())] : []),
    ...(input.santanderClientSecret?.trim()
      ? [setSetting(SANTANDER_CLIENT_SECRET_KEY, input.santanderClientSecret.trim())]
      : []),
    ...(input.santanderCertificatePem?.trim()
      ? [setSetting(SANTANDER_CERTIFICATE_PEM_KEY, input.santanderCertificatePem.trim())]
      : []),
    ...(input.santanderPrivateKeyPem?.trim()
      ? [setSetting(SANTANDER_PRIVATE_KEY_PEM_KEY, input.santanderPrivateKeyPem.trim())]
      : []),
    ...(input.santanderPfxBase64?.trim()
      ? [setSetting(SANTANDER_PFX_BASE64_KEY, input.santanderPfxBase64.trim())]
      : []),
    ...(input.santanderPfxPassphrase !== undefined
      ? [setSetting(SANTANDER_PFX_PASSPHRASE_KEY, input.santanderPfxPassphrase)]
      : []),
    ...(input.santanderPixKey?.trim() ? [setSetting(SANTANDER_PIX_KEY_KEY, input.santanderPixKey.trim())] : []),
  ]);

  return getAdminSettings();
}

function ensureSetting(key: string, value: string) {
  return prisma.appSetting.upsert({
    where: { key },
    update: {},
    create: { key, value },
  });
}

function setSetting(key: string, value: string) {
  return prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
