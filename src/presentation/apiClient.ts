import type { Announcement, BoardItem, BoardType, Station } from "@/domain/types";

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "La demande a echoue.");
  }
  return (await response.json()) as T;
};

export const searchStations = (query: string): Promise<Station[]> =>
  getJson(`/api/stations/search?q=${encodeURIComponent(query)}`);

export const nearbyStations = (latitude: number, longitude: number): Promise<Station[]> =>
  getJson(`/api/stations/nearby?lat=${latitude}&lon=${longitude}`);

export const stationBoard = (stationId: string, type: BoardType): Promise<BoardItem[]> =>
  getJson(`/api/stations/${encodeURIComponent(stationId)}/board?type=${type}`);

export const stationAnnouncements = (stationId: string): Promise<Announcement[]> =>
  getJson(`/api/stations/${encodeURIComponent(stationId)}/announcements`);
