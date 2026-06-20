import type { BoardRepository, StationRepository } from "@/domain/ports";
import type { BoardItem, BoardType, Coordinates, Station } from "@/domain/types";
import type { SncfHttpClient } from "./sncfClient";
import { SncfBoardAdapter, SncfStationAdapter } from "./sncfAdapters";
import {
  boardResponseSchema,
  nearbyResponseSchema,
  placesResponseSchema,
  type BoardResponse,
  type NearbyResponse,
  type PlacesResponse,
} from "./sncfSchemas";

export class SncfStationRepository implements StationRepository {
  constructor(
    private readonly client: SncfHttpClient,
    private readonly adapter: SncfStationAdapter,
  ) {}

  async search(query: string): Promise<Station[]> {
    if (query.length < 2) return [];

    const response = await this.client.get<PlacesResponse>("/coverage/sncf/places", {
      q: query,
      "type[]": "stop_area",
      count: 8,
    });
    if (!response.ok) throw response.error;

    return this.adapter.fromPlaces(placesResponseSchema.parse(response.value));
  }

  async nearby(coordinates: Coordinates): Promise<Station[]> {
    const response = await this.client.get<NearbyResponse>(
      `/coverage/sncf/coords/${coordinates.longitude};${coordinates.latitude}/places_nearby`,
      {
        "type[]": "stop_area",
        count: 8,
        distance: 3000,
      },
    );
    if (!response.ok) throw response.error;

    return this.adapter.fromNearby(nearbyResponseSchema.parse(response.value));
  }
}

export class SncfBoardRepository implements BoardRepository {
  constructor(
    private readonly client: SncfHttpClient,
    private readonly adapter: SncfBoardAdapter,
  ) {}

  async getBoard(stationId: string, type: BoardType): Promise<BoardItem[]> {
    const response = await this.client.get<BoardResponse>(
      `/coverage/sncf/stop_areas/${encodeURIComponent(stationId)}/${type}`,
      {
        count: 20,
        depth: 3,
        data_freshness: "realtime",
      },
    );
    if (!response.ok) throw response.error;

    return this.adapter.fromBoard(boardResponseSchema.parse(response.value), type);
  }
}
