import { createApplication } from "@/infrastructure/container";
import { badRequest, errorResponse, jsonResponse } from "../../_shared/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return badRequest("Les coordonnees lat et lon sont obligatoires.");
  }

  try {
    const app = createApplication();
    const stations = await app.findNearbyStations.execute({ latitude, longitude });
    return jsonResponse(stations);
  } catch (error) {
    return errorResponse(error);
  }
}
