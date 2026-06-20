import { createApplication } from "@/infrastructure/container";
import { badRequest, errorResponse, privateNoStoreJsonResponse } from "../../_shared/http";
import { checkRateLimit } from "../../_shared/rateLimit";
import { nearbyStationQuerySchema, validationMessage } from "../../_shared/validation";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rateLimitResponse = checkRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const params = new URL(request.url).searchParams;
  const parsedCoordinates = nearbyStationQuerySchema.safeParse({
    latitude: params.get("lat"),
    longitude: params.get("lon"),
  });
  if (!parsedCoordinates.success) return badRequest(validationMessage(parsedCoordinates.error));

  try {
    const app = createApplication();
    const { latitude, longitude } = parsedCoordinates.data;
    const stations = await app.findNearbyStations.execute({ latitude, longitude });
    return privateNoStoreJsonResponse(stations);
  } catch (error) {
    return errorResponse(error);
  }
}
