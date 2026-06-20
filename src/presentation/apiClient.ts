import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";

type PagingOptions = {
  fromDateTime?: string;
  page?: number;
};

const DEFAULT_NETWORK_ERROR =
  "Connexion impossible. Verifiez votre reseau ou reessayez dans quelques instants.";

const getJson = async <T>(url: string): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error(DEFAULT_NETWORK_ERROR);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Le service est momentanément indisponible. Réessayez dans quelques instants.");
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("La réponse du service est illisible. Réessayez dans quelques instants.");
  }
};

export const searchStations = (query: string): Promise<Station[]> =>
  getJson(`/api/stations/search?q=${encodeURIComponent(query)}`);

export const nearbyStations = (latitude: number, longitude: number): Promise<Station[]> =>
  getJson(`/api/stations/nearby?lat=${latitude}&lon=${longitude}`);

const pagingParams = (options: PagingOptions = {}) => {
  const params = new URLSearchParams();
  if (options.fromDateTime) params.set("fromDateTime", options.fromDateTime);
  if (options.page !== undefined) params.set("page", String(options.page));
  return params;
};

export const stationBoard = (
  stationId: string,
  type: BoardType,
  options: PagingOptions = {},
): Promise<BoardItem[]> => {
  const params = pagingParams(options);
  params.set("type", type);
  return getJson(`/api/stations/${encodeURIComponent(stationId)}/board?${params.toString()}`);
};

export const stationAnnouncements = (
  stationId: string,
  options: PagingOptions = {},
): Promise<Announcement[]> => {
  const params = pagingParams(options);
  return getJson(`/api/stations/${encodeURIComponent(stationId)}/announcements?${params.toString()}`);
};

export const trainDetails = (vehicleJourneyId: string): Promise<Partial<BoardItem>> =>
  getJson(`/api/trains/${encodeURIComponent(vehicleJourneyId)}`);
