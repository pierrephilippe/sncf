import { z } from "zod";

const coordSchema = z.object({
  lat: z.string().optional(),
  lon: z.string().optional(),
});

const stopAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  coord: coordSchema.optional(),
});

const stopPointSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
});

const placeSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  embedded_type: z.string().optional(),
  stop_area: stopAreaSchema.optional(),
});

export const placesResponseSchema = z.object({
  places: z.array(placeSchema).default([]),
});

export const nearbyResponseSchema = z.object({
  places_nearby: z
    .array(
      placeSchema.extend({
        distance: z.string().or(z.number()).optional(),
      }),
    )
    .default([]),
});

const disruptionSchema = z.object({
  id: z.string().optional(),
  messages: z
    .array(
      z.object({
        text: z.string().optional(),
      }),
    )
    .optional(),
  severity: z
    .object({
      name: z.string().optional(),
      effect: z.string().optional(),
    })
    .optional(),
});

const displayInformationSchema = z.object({
  code: z.string().optional(),
  direction: z.string().optional(),
  headsign: z.string().optional(),
  label: z.string().optional(),
  name: z.string().optional(),
});

const stopDateTimeSchema = z.object({
  base_departure_date_time: z.string().optional(),
  departure_date_time: z.string().optional(),
  base_arrival_date_time: z.string().optional(),
  arrival_date_time: z.string().optional(),
  data_freshness: z.string().optional(),
  links: z.array(z.object({ id: z.string().optional(), type: z.string().optional() })).optional(),
});

const boardEntrySchema = z.object({
  display_informations: displayInformationSchema.optional(),
  stop_date_time: stopDateTimeSchema,
  route: z
    .object({
      stop_points: z.array(stopPointSchema).optional(),
    })
    .optional(),
});

export const boardResponseSchema = z.object({
  departures: z.array(boardEntrySchema).optional(),
  arrivals: z.array(boardEntrySchema).optional(),
  disruptions: z.array(disruptionSchema).optional(),
});

export type PlacesResponse = z.infer<typeof placesResponseSchema>;
export type NearbyResponse = z.infer<typeof nearbyResponseSchema>;
export type BoardResponse = z.infer<typeof boardResponseSchema>;
