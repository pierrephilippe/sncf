import { z } from "zod";

export const stationSearchQuerySchema = z.string()
  .trim()
  .min(2, "La recherche doit contenir au moins 2 caracteres.")
  .max(80, "La recherche doit contenir au maximum 80 caracteres.");

const finiteCoordinate = z.coerce.number().finite();

export const nearbyStationQuerySchema = z.object({
  latitude: finiteCoordinate.min(-90, "La latitude doit être comprise entre -90 et 90.").max(90),
  longitude: finiteCoordinate.min(-180, "La longitude doit être comprise entre -180 et 180.").max(180),
});

export const validationMessage = (error: z.ZodError): string =>
  error.issues[0]?.message ?? "Les paramètres de la requête sont invalides.";
