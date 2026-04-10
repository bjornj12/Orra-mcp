import { ProviderResultSchema, type HttpProviderConfig, type StateProvider, type ProviderResult } from "./types.js";
import { expandEnv, expandRecord } from "./env-expand.js";

export function createHttpProvider(config: HttpProviderConfig): StateProvider {
  const name = `http:${config.url.replace(/^https?:\/\//, "").split("/")[0]}`;

  return {
    name,
    config,
    async fetch(): Promise<ProviderResult> {
      const url = expandEnv(config.url);
      const headers = expandRecord(config.headers);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      try {
        const response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
          redirect: config.followRedirects ? "follow" : "error",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return ProviderResultSchema.parse(json);
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
