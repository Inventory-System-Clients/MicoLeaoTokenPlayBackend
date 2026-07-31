import { spawnSync } from "node:child_process";

const CAMPAIGN_MIGRATION = "20260714130000_add_campaigns";

function run(command: string, args: string[]) {
  return spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
}

function runCapture(command: string, args: string[]) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

function main() {
  const firstDeploy = runCapture("npx", ["prisma", "migrate", "deploy"]);
  if (firstDeploy.status === 0) {
    runRequired("node", ["dist/scripts/ensure-admin.js"]);
    runRequired("node", ["dist/server.js"]);
    return;
  }

  const output = `${firstDeploy.stdout ?? ""}\n${firstDeploy.stderr ?? ""}`;
  process.stdout.write(firstDeploy.stdout ?? "");
  process.stderr.write(firstDeploy.stderr ?? "");

  if (output.includes("P3009") && output.includes(CAMPAIGN_MIGRATION)) {
    console.log(`Resolvendo tentativa falha de migration: ${CAMPAIGN_MIGRATION}`);
    runRequired("npx", ["prisma", "migrate", "resolve", "--rolled-back", CAMPAIGN_MIGRATION]);
    runRequired("npx", ["prisma", "migrate", "deploy"]);
    runRequired("node", ["dist/scripts/ensure-admin.js"]);
    runRequired("node", ["dist/server.js"]);
    return;
  }

  process.exit(firstDeploy.status ?? 1);
}

function runRequired(command: string, args: string[]) {
  const result = run(command, args);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main();
