// Runs the Asmita crawler (crawler/, ADR 006) on Cloudflare Containers.
//
// Every hour the cron trigger asks one Durable Object to start a crawler
// container if none is running. The container runs one pass (`run`, capped by
// MAX_RUN_MINUTES) and exits; the next hour starts the next pass. The image is
// crawler/Dockerfile, unchanged. The service key is a Worker secret, passed in
// the container's environment at start (the crawler deletes it from its own
// environment on startup) and never baked into the image.
//
// Containers offer no file mounts for secrets, so unlike the Cloud Run
// deployment the key must travel as an env var here. The WP25 image still
// keeps it from the browser worker: the worker runs as the separate
// browser-worker uid (setuid drop helper) with a scrubbed environment, so it
// can neither see CRAWLER_SERVICE_KEY in its own environment nor read the
// crawler's /proc/<pid>/environ (that file belongs to the crawler's user).
// The /proc caveat for a same-uid decoder exploit remains, as documented in
// crawler/README.md's decoder section.
import { DurableObject } from "cloudflare:workers";

// The container keeps running after this Durable Object goes idle, for up to
// this long. A pass stops itself at MAX_RUN_MINUTES (50), so 55 minutes is the
// backstop for a pass that hangs; the next hourly trigger then starts afresh.
const INACTIVITY_TIMEOUT_MS = 55 * 60 * 1000;

interface Env {
  CRAWLER_RUNNER: DurableObjectNamespace<CrawlerRunner>;
  // Secret: wrangler secret put CRAWLER_SERVICE_KEY
  CRAWLER_SERVICE_KEY: string;
  ASMITA_API_URL: string;
  CRAWLER_USER_AGENT: string;
  MAX_RUN_MINUTES: string;
  INSTANCE_TYPE: string;
}

type StartResult = "started" | "already_running" | "not_configured";

export class CrawlerRunner extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container!;
    if (container.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
    }
  }

  async startPass(): Promise<StartResult> {
    const container = this.ctx.container!;
    if (container.running) return "already_running";
    if (!this.env.CRAWLER_SERVICE_KEY || !this.env.ASMITA_API_URL) return "not_configured";
    container.start({
      image: container.images.base,
      instance: this.env.INSTANCE_TYPE as "standard-2",
      enableInternet: true,
      env: {
        ASMITA_API_URL: this.env.ASMITA_API_URL,
        CRAWLER_SERVICE_KEY: this.env.CRAWLER_SERVICE_KEY,
        CRAWLER_USER_AGENT: this.env.CRAWLER_USER_AGENT,
        MAX_RUN_MINUTES: this.env.MAX_RUN_MINUTES,
      },
    });
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    return "started";
  }

  status(): { running: boolean } {
    return { running: this.ctx.container!.running };
  }
}

export default {
  // No public interface: the crawler is driven only by the cron trigger.
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const result = await env.CRAWLER_RUNNER.getByName("crawler").startPass();
    // Counts and states only; never addresses, keys or fingerprints.
    console.log(JSON.stringify({ event: "crawler_trigger", result }));
  },
} satisfies ExportedHandler<Env>;
