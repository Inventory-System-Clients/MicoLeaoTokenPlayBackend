import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../utils/password";

const prisma = new PrismaClient();

const readEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    return undefined;
  }

  const cleaned = value.trim().replace(new RegExp(`^${key}\\s*=\\s*`, "i"), "").trim();
  if (!cleaned) {
    return undefined;
  }
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return cleaned.slice(1, -1).trim();
  }

  return cleaned;
};

async function main() {
  const email = readEnv("ADMIN_EMAIL");
  const password = readEnv("ADMIN_PASSWORD");
  const name = readEnv("ADMIN_NAME") || "Administrador Agarra Mais";
  const cpf = readEnv("ADMIN_CPF") || "00000000000";

  if (!email || !password) {
    console.log("ADMIN_EMAIL/ADMIN_PASSWORD ausentes; pulando criacao de admin.");
    return;
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      name,
      email,
      cpf,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log(`Admin garantido: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
