import type { BoardItem, BoardType, Disruption, Station, TrainStatus } from "@/domain/types";
import type { BoardResponse, NearbyResponse, PlacesResponse, VehicleJourneyResponse } from "./sncfSchemas";

const compact = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const SNCF_TIME_ZONE = "Europe/Paris";

const looksLikeRouteLabel = (value: string | undefined): boolean =>
  Boolean(value && /\s[-–—]\s/.test(value));

const trainNumberFromDisplay = (code?: string, headsign?: string): string | undefined => {
  const compactHeadsign = compact(headsign);
  if (compactHeadsign && /^\d+[A-Z]?$/i.test(compactHeadsign)) return compactHeadsign;
  return compact(code);
};

const routeLabelFromDisplay = (...values: Array<string | undefined>): string | undefined =>
  values.map(compact).find(looksLikeRouteLabel);

export class SncfStationAdapter {
  fromPlaces(response: PlacesResponse): Station[] {
    return response.places
      .map((place) => place.stop_area)
      .filter((stopArea): stopArea is NonNullable<typeof stopArea> => Boolean(stopArea))
      .map((stopArea) => ({
        id: stopArea.id,
        name: stopArea.name,
        city: inferCity(stopArea.label ?? stopArea.name) ?? stopArea.name,
        coordinates: toCoordinates(stopArea.coord?.lat, stopArea.coord?.lon),
        source: "sncf" as const,
      }));
  }

  fromNearby(response: NearbyResponse): Station[] {
    return response.places_nearby
      .flatMap((place): Station[] => {
        const stopArea = place.stop_area;
        if (!stopArea) return [];

        return [{
          id: stopArea.id,
          name: stopArea.name,
          city: inferCity(stopArea.label ?? stopArea.name) ?? stopArea.name,
          coordinates: toCoordinates(stopArea.coord?.lat, stopArea.coord?.lon),
          source: "sncf" as const,
          distanceMeters: place.distance === undefined ? undefined : Number(place.distance),
        }];
      })
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
      const routeLabel = routeLabelFromDisplay(display?.label, display?.name, entry.route?.name);
      const servedStations = mapServedStations(entry.route?.stop_points);

      return {
        id: `${type}-${display?.code ?? "train"}-${realtimeTime ?? baseTime ?? "time-unknown"}-${index}`,
        vehicleJourneyId: findVehicleJourneyId(stopDate.links),
        time: toIsoDate(baseTime ?? realtimeTime),
        expectedTime: realtimeTime && realtimeTime !== baseTime ? toIsoDate(realtimeTime) : undefined,
        destination: type === "departures"
          ? compact(display?.direction)
          : undefined,
        origin: type === "arrivals"
          ? servedStations?.[0]
          : undefined,
        servedStations,
        line: compact(display?.commercial_mode) ?? compact(display?.physical_mode),
        routeLabel,
        trainNumber: trainNumberFromDisplay(display?.code, display?.headsign),
        platform: undefined,
        status: inferStatus(baseTime, realtimeTime, linkedDisruptions),
        disruptions: linkedDisruptions,
      };
    });
  }

  fromVehicleJourney(response: VehicleJourneyResponse): Partial<BoardItem> {
    const vehicleJourney = response.vehicle_journeys?.[0];
    if (!vehicleJourney) return {};

    const stopTimeStations = vehicleJourney.stop_times
      ?.map((stopTime) => compact(stopTime.stop_point?.name ?? stopTime.stop_point?.label))
      .filter((stationName): stationName is string => Boolean(stationName));
    const servedStations = stopTimeStations && stopTimeStations.length > 0
      ? stopTimeStations
      : mapServedStations(vehicleJourney.route?.stop_points);

    return {
      servedStations,
      routeLabel: routeLabelFromDisplay(vehicleJourney.route?.name),
    };
  }
}

const findVehicleJourneyId = (
  links: Array<{ id?: string; rel?: string; type?: string }> | undefined,
): string | undefined =>
  links?.find((link) => (link.type === "vehicle_journey" || link.rel === "vehicle_journeys") && link.id)?.id;

const toCoordinates = (lat?: string, lon?: string) => {
  if (!lat || !lon) return undefined;
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return undefined;
  return { latitude, longitude };
};

const toIsoDate = (sncfDate?: string): string => {
  if (!sncfDate || !/^\d{8}T\d{6}$/.test(sncfDate)) return new Date().toISOString();
  const year = Number(sncfDate.slice(0, 4));
  const month = Number(sncfDate.slice(4, 6));
  const day = Number(sncfDate.slice(6, 8));
  const hour = Number(sncfDate.slice(9, 11));
  const minute = Number(sncfDate.slice(11, 13));
  const second = Number(sncfDate.slice(13, 15));

  return parisWallTimeToIso(year, month, day, hour, minute, second);
};

const parisWallTimeToIso = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string => {
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let timestamp = wallTimeAsUtc - timeZoneOffsetMs(new Date(wallTimeAsUtc), SNCF_TIME_ZONE);
  timestamp = wallTimeAsUtc - timeZoneOffsetMs(new Date(timestamp), SNCF_TIME_ZONE);
  return new Date(timestamp).toISOString();
};

const timeZoneOffsetMs = (date: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const zonedTimestamp = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );

  return zonedTimestamp - date.getTime();
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

const mapServedStations = (
  stopPoints: Array<{ name?: string; label?: string }> | undefined,
): string[] | undefined => {
  const stations = Array.from(
    new Set(
      stopPoints
        ?.map((stopPoint) => compact(stopPoint.name) ?? compact(stopPoint.label))
        .filter((name): name is string => Boolean(name)) ?? [],
    ),
  );

  return stations.length > 0 ? stations : undefined;
};

const inferCity = (name: string): string | undefined => {
  const match = name.match(/\(([^)]+)\)$/);
  return match?.[1];
};
