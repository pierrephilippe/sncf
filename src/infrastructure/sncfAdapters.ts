import type { BoardItem, BoardType, Disruption, Station, TrainStatus } from "@/domain/types";
import type { BoardResponse, NearbyResponse, PlacesResponse } from "./sncfSchemas";

const compact = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export class SncfStationAdapter {
  fromPlaces(response: PlacesResponse): Station[] {
    return response.places
      .map((place) => place.stop_area)
      .filter((stopArea): stopArea is NonNullable<typeof stopArea> => Boolean(stopArea))
      .map((stopArea) => ({
        id: stopArea.id,
        name: stopArea.name,
        city: inferCity(stopArea.name),
        coordinates: toCoordinates(stopArea.coord?.lat, stopArea.coord?.lon),
        source: "sncf" as const,
      }));
  }

  fromNearby(response: NearbyResponse): Station[] {
    return response.places_nearby
      .map((place) => {
        const stopArea = place.stop_area;
        if (!stopArea) return undefined;

        return {
          id: stopArea.id,
          name: stopArea.name,
          city: inferCity(stopArea.name),
          coordinates: toCoordinates(stopArea.coord?.lat, stopArea.coord?.lon),
          source: "sncf" as const,
          distanceMeters: place.distance === undefined ? undefined : Number(place.distance),
        };
      })
      .filter((station): station is Station => Boolean(station))
      .sort((a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER));
  }
}

export class SncfBoardAdapter {
  fromBoard(response: BoardResponse, type: BoardType): BoardItem[] {
    const entries = type === "departures" ? response.departures ?? [] : response.arrivals ?? [];
    const disruptions = response.disruptions ?? [];

    return entries.map((entry, index) => {
      const display = entry.display_informations;
      const stopDate = entry.stop_date_time;
      const baseTime =
        type === "departures" ? stopDate.base_departure_date_time : stopDate.base_arrival_date_time;
      const realtimeTime =
        type === "departures" ? stopDate.departure_date_time : stopDate.arrival_date_time;
      const linkedDisruptions = mapLinkedDisruptions(stopDate.links, disruptions);

      return {
        id: `${display?.code ?? "train"}-${realtimeTime ?? baseTime ?? index}`,
        time: toIsoDate(baseTime ?? realtimeTime),
        expectedTime: realtimeTime && realtimeTime !== baseTime ? toIsoDate(realtimeTime) : undefined,
        destination: compact(display?.direction) ?? compact(display?.headsign) ?? "Destination non communiquee",
        line: compact(display?.label) ?? compact(display?.name),
        trainNumber: compact(display?.code),
        platform: undefined,
        status: inferStatus(baseTime, realtimeTime, linkedDisruptions),
        disruptions: linkedDisruptions,
      };
    });
  }
}

const toCoordinates = (lat?: string, lon?: string) => {
  if (!lat || !lon) return undefined;
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return undefined;
  return { latitude, longitude };
};

const toIsoDate = (sncfDate?: string): string => {
  if (!sncfDate || !/^\d{8}T\d{6}$/.test(sncfDate)) return new Date().toISOString();
  const year = sncfDate.slice(0, 4);
  const month = sncfDate.slice(4, 6);
  const day = sncfDate.slice(6, 8);
  const hour = sncfDate.slice(9, 11);
  const minute = sncfDate.slice(11, 13);
  const second = sncfDate.slice(13, 15);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+01:00`;
};

const inferStatus = (
  baseTime: string | undefined,
  realtimeTime: string | undefined,
  disruptions: Disruption[],
): TrainStatus => {
  const text = disruptions.map((item) => `${item.title} ${item.message ?? ""}`).join(" ").toLowerCase();
  if (text.includes("supprim") || text.includes("cancel")) return "cancelled";
  if (baseTime && realtimeTime && baseTime !== realtimeTime) return "delayed";
  if (disruptions.length > 0) return "disrupted";
  return "on_time";
};

const mapLinkedDisruptions = (
  links: Array<{ id?: string; type?: string }> | undefined,
  disruptions: NonNullable<BoardResponse["disruptions"]>,
): Disruption[] => {
  const linkedIds = new Set(
    links?.filter((link) => link.type === "disruption" && link.id).map((link) => link.id) ?? [],
  );

  return disruptions
    .filter((disruption) => disruption.id && linkedIds.has(disruption.id))
    .map((disruption) => ({
      id: disruption.id ?? crypto.randomUUID(),
      title: disruption.severity?.name ?? disruption.severity?.effect ?? "Perturbation",
      message: disruption.messages?.map((message) => message.text).filter(Boolean).join(" "),
      severity: disruption.severity?.effect,
    }));
};

const inferCity = (name: string): string | undefined => {
  const match = name.match(/\(([^)]+)\)$/);
  return match?.[1];
};
