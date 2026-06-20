import { err, ok, type Result } from "@/domain/result";

export interface SncfHttpClient {
  get<T>(path: string, params?: Record<string, string | number | string[]>): Promise<Result<T>>;
}

export class FetchSncfHttpClient implements SncfHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async get<T>(
    path: string,
    params: Record<string, string | number | string[]> = {},
  ): Promise<Result<T>> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);

    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, entry));
        return;
      }
      url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await this.fetcher(url, {
        headers: {
          Authorization: this.token,
          Accept: "application/json",
        },
        signal: controller.signal,
        next: { revalidate: 30 },
      });

      if (!response.ok) {
        return err("external_api", "L'API SNCF a retourné une erreur.", response.status);
      }

      return ok((await response.json()) as T);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return err("timeout", "L'API SNCF ne repond pas assez vite.", 504);
      }
      return err("external_api", "Impossible de contacter l'API SNCF.", 502, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
