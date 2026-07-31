import "dotenv/config";
import { z } from "zod";

// z.coerce.boolean() faz Boolean(string), e "false" e uma string nao-vazia
// (portanto truthy) - isso faria COMPACTPAY_MOCK=false/MP_MOCK=false serem
// sempre interpretados como true. Usamos um parse explicito por string.
const booleanFlag = (defaultValue: boolean) =>
  z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true");

const cleanEnvValue = (key: string, value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  let cleaned = value.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  const assignmentPrefix = new RegExp(`^${key}\\s*=\\s*`, "i");
  cleaned = cleaned.replace(assignmentPrefix, "").trim();
  if (!cleaned) {
    return undefined;
  }

  const urlKeys = new Set(["APP_BASE_URL", "BACKEND_PUBLIC_URL", "COMPACTPAY_API_URL", "MP_API_BASE_URL"]);
  if (urlKeys.has(key) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) {
    return `https://${cleaned}`;
  }

  return cleaned;
};

const normalizedEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, cleanEnvValue(key, value)]),
);

const rawEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // URL fixa do backend real da CompactPay (nao e segredo, pode ficar commitada).
  // EMAIL/PASSWORD sao realmente exigidos quando COMPACTPAY_MOCK=false (ver
  // validacao abaixo) - em modo mock a CompactPay nunca e chamada de verdade.
  COMPACTPAY_API_URL: z.string().url().default("https://compactpayback.onrender.com/api/v1"),
  COMPACTPAY_API_EMAIL: z.string().min(1).optional(),
  COMPACTPAY_API_PASSWORD: z.string().min(1).optional(),
  COMPACTPAY_MOCK: booleanFlag(true),

  // Idem: MP_ACCESS_TOKEN so e exigido quando MP_MOCK=false.
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_API_BASE_URL: z.string().url().default("https://api.mercadopago.com"),
  MP_MOCK: booleanFlag(true),

  // Usadas para montar back_urls (retorno do checkout) e notification_url (webhook).
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:3333"),
});

const parsed = rawEnvSchema.parse(normalizedEnv);

if (!parsed.COMPACTPAY_MOCK) {
  if (!parsed.COMPACTPAY_API_EMAIL || !parsed.COMPACTPAY_API_PASSWORD) {
    throw new Error(
      "COMPACTPAY_API_EMAIL e COMPACTPAY_API_PASSWORD sao obrigatorios quando COMPACTPAY_MOCK=false",
    );
  }
}

if (!parsed.MP_MOCK && !parsed.MP_ACCESS_TOKEN) {
  throw new Error("MP_ACCESS_TOKEN e obrigatorio quando MP_MOCK=false");
}

if (!parsed.MP_MOCK && parsed.MP_ACCESS_TOKEN?.startsWith("TEST-")) {
  throw new Error("MP_ACCESS_TOKEN de teste detectado. Em producao use o Access Token real que comeca com APP_USR-");
}

export const env = parsed;
