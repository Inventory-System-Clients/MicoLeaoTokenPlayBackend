import { buildApp } from "./app";
import { env } from "./config/env";

const app = buildApp();

app
  .listen({ port: env.PORT, host: env.HOST })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
