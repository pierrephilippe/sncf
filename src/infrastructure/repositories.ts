import type { BoardRepository, StationRepository, TrainDetailsRepository } from "@/domain/ports";
import type { BoardItem, BoardQuery, BoardType, Coordinates, Station } from "@/domain/types";
import type { SncfHttpClient } from "./sncfClient";
import { SncfBoardAdapter, SncfStationAdapter } from "./sncfAdapters";
import {
  boardResponseSchema,
  nearbyResponseSchema,
  placesResponseSchema,
  stopAreasResponseSchema,
  vehicleJourneyResponseSchema,
  type BoardResponse,
  type NearbyResponse,
  type PlacesResponse,
  type StopAreasResponse,
  type VehicleJourneyResponse,
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

  async getBoard(stationId: string, type: BoardType, query: BoardQuery = {}): Promise<BoardItem[]> {
    const response = await this.client.get<BoardResponse>(
      `/coverage/sncf/stop_areas/${encodeURIComponent(stationId)}/${type}`,
      {
        count: query.count ?? 20,
        start_page: query.page ?? 0,
        ...(query.fromDateTime ? { from_datetime: toSncfDateTime(query.fromDateTime) } : {}),
        depth: 3,
        data_freshness: "realtime",
      },
    );
    if (!response.ok) throw response.error;

    const parsedResponse = boardResponseSchema.parse(response.value);
    const board = this.adapter.fromBoard(parsedResponse, type);

    if (type === "departures") return this.withResolvedDepartureDestinations(board, parsedResponse);
    if (type === "arrivals") return this.withResolvedArrivalOrigins(board, parsedResponse);

    return board;
  }

  private async withResolvedDepartureDestinations(board: BoardItem[], response: BoardResponse): Promise<BoardItem[]> {
    const terminusIds = (response.departures ?? []).map((departure) => findLinkedStopAreaId(
      departure.stop_date_time.links,
      "terminus",
    ));
    const uniqueTerminusIds = Array.from(new Set(terminusIds.filter((id): id is string => Boolean(id))));

    if (uniqueTerminusIds.length === 0) return board;

    const destinationNames = await this.resolveStopAreaNames(uniqueTerminusIds);

    return board.map((item, index) => {
      const destinationName = destinationNames.get(terminusIds[index] ?? "");
      return destinationName ? { ...item, destination: destinationName } : item;
    });
  }

  private async withResolvedArrivalOrigins(board: BoardItem[], response: BoardResponse): Promise<BoardItem[]> {
    const originIds = (response.arrivals ?? []).map((arrival) => findLinkedStopAreaId(
      arrival.stop_date_time.links,
      "origins",
    ));
    const uniqueOriginIds = Array.from(new Set(originIds.filter((id): id is string => Boolean(id))));

    if (uniqueOriginIds.length === 0) return board;

    const originNames = await this.resolveStopAreaNames(uniqueOriginIds);

    return board.map((item, index) => {
      const originName = originNames.get(originIds[index] ?? "");
      return originName ? { ...item, origin: originName } : item;
    });
  }

  private async resolveStopAreaNames(stopAreaIds: string[]): Promise<Map<string, string>> {
    const entries = await Promise.all(
      stopAreaIds.map(async (stopAreaId): Promise<[string, string] | null> => {
        try {
          const response = await this.client.get<StopAreasResponse>(
            `/coverage/sncf/stop_areas/${encodeURIComponent(stopAreaId)}`,
          );
          if (!response.ok) return null;

          const stopArea = stopAreasResponseSchema.parse(response.value).stop_areas[0];
          return stopArea?.name ? [stopAreaId, stopArea.name] : null;
        } catch {
          return null;
        }
      }),
    );

    return new Map(entries.filter((entry): entry is [string, string] => Boolean(entry)));
  }
}

export class SncfTrainDetailsRepository implements TrainDetailsRepository {
  constructor(
    private readonly client: SncfHttpClient,
    private readonly adapter: SncfBoardAdapter,
  ) {}

  async getTrainDetails(vehicleJourneyId: string): Promise<Partial<BoardItem>> {
    const response = await this.client.get<VehicleJourneyResponse>(
      `/coverage/sncf/vehicle_journeys/${encodeURIComponent(vehicleJourneyId)}`,
      {
        depth: 3,
        data_freshness: "realtime",
      },
    );
    if (!response.ok) throw response.error;

    return this.adapter.fromVehicleJourney(vehicleJourneyResponseSchema.parse(response.value));
  }
}

const toSncfDateTime = (isoDate: string): string => {
  const date = new Date(isoDate);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${value("year")}${value("month")}${value("day")}T${value("hour")}${value("minute")}${value("second")}`;
};

const findLinkedStopAreaId = (
  links: Array<{ id?: string; rel?: string; type?: string }> | undefined,
  rel: "origins" | "terminus",
): string | undefined =>
  links?.find((link) => link.type === "stop_area" && link.rel === rel && link.id)?.id;
