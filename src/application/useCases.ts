import type { BoardRepository, StationRepository } from "@/domain/ports";
import { AnnouncementService } from "@/domain/announcements";
import type { Announcement, BoardItem, BoardQuery, BoardType, Coordinates, Station } from "@/domain/types";

export class SearchStationsUseCase {
  constructor(private readonly stations: StationRepository) {}

  execute(query: string): Promise<Station[]> {
    return this.stations.search(query.trim());
  }
}

export class FindNearbyStationsUseCase {
  constructor(private readonly stations: StationRepository) {}

  execute(coordinates: Coordinates): Promise<Station[]> {
    return this.stations.nearby(coordinates);
  }
}

export class GetStationBoardUseCase {
  constructor(private readonly boards: BoardRepository) {}

  execute(stationId: string, type: BoardType, query?: BoardQuery): Promise<BoardItem[]> {
    return this.boards.getBoard(stationId, type, query);
  }
}

export class GetStationAnnouncementsUseCase {
  constructor(
    private readonly boards: BoardRepository,
    private readonly announcements: AnnouncementService,
  ) {}

  async execute(stationId: string, query?: BoardQuery): Promise<Announcement[]> {
    const departures = await this.boards.getBoard(stationId, "departures", query);
    return this.announcements.fromBoard(departures);
  }
}
