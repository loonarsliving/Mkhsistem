import { Container } from "@cloudflare/containers";

/**
 * One Container Durable Object instance per in-flight render job (keyed by
 * jobId in worker/index.ts). Cloudflare puts the instance to sleep
 * `sleepAfter` idle time after the render response is sent, so billing
 * tracks actual render minutes instead of a 24/7 process.
 */
export class RenderContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
}
