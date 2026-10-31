import app from "vinext/server/fetch-handler";

type WorkerEnv = {
  ASSETS: unknown;
  CRON_SECRET: string;
  HYPERDRIVE?: {
    connectionString: string;
  };
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type WorkerScheduledController = {
  cron: string;
};

const cronRoutes: Record<string, string> = {
  "30 20 * * *": "/api/cron/sweep-due-jobs",
  "30 22 * * *": "/api/cron/maintenance",
};

function configureDatabase(env: WorkerEnv) {
  // Hyperdrive provides an edge-safe connection string to the regional
  // PostgreSQL origin. The Worker Kysely/pg layer reads it at first use.
  if (env.HYPERDRIVE?.connectionString) {
    process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
    process.env.ASMITA_DATABASE_DRIVER = "pg";
  }
}

const worker = {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) {
    configureDatabase(env);
    const url = new URL(request.url);
    if (url.hostname === "www.meriasmita.org") {
      url.hostname = "meriasmita.org";
      return Response.redirect(url.toString(), 308);
    }
    return app.fetch(request, env, ctx);
  },

  scheduled(controller: WorkerScheduledController, env: WorkerEnv, ctx: WorkerExecutionContext) {
    configureDatabase(env);
    const path = cronRoutes[controller.cron];
    if (!path) {
      console.error(`Unknown Cloudflare cron schedule: ${controller.cron}`);
      return;
    }
    if (!env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured; scheduled task skipped");
      return;
    }
    const request = new Request(`https://asmita.internal${path}`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    ctx.waitUntil(
      app.fetch(request, env, ctx).then(async (response: Response) => {
        if (!response.ok) {
          console.error(`Scheduled task ${path} failed with ${response.status}: ${await response.text()}`);
        }
      }),
    );
  },
};

export default worker;
