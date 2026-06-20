import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";

const DEFAULT_NETWORK_ERROR =
  "Connexion impossible. Verifiez votre reseau ou reessayez dans quelques instants.";

const getJson = async <T>(url: string): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url);
  } catch {
    throw new Error(DEFAULT_NETWORK_ERROR);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Le service est momentanement indisponible. Reessayez dans quelques instants.");
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("La reponse du service est illisible. Reessayez dans quelques instants.");
  }
};

export const searchStations = (query: string): Promise<Station[]> =>
  getJson(`/api/stations/search?q=${encodeURIComponent(query)}`);

export const nearbyStations = (latitude: number, longitude: number): Promise<Station[]> =>
  getJson(`/api/stations/nearby?lat=${latitude}&lon=${longitude}`);

export const stationBoard = (stationId: string, type: BoardType): Promise<BoardItem[]> =>
  getJson(`/api/stations/${encodeURIComponent(stationId)}/board?type=${type}`);

export const stationAnnouncements = (stationId: string): Promise<Announcement[]> =>
  getJson(`/api/stations/${encodeURIComponent(stationId)}/announcements`);
