import type { Announcement, BoardItem, BoardQuery, BoardType, Coordinates, Station } from "./types";

export interface StationRepository {
  search(query: string): Promise<Station[]>;
  nearby(coordinates: Coordinates): Promise<Station[]>;
}

export interface BoardRepository {
  getBoard(stationId: string, type: BoardType, query?: BoardQuery): Promise<BoardItem[]>;
}

export interface StationAnnouncementService {
  forStation(stationId: string): Promise<Announcement[]>;
}
