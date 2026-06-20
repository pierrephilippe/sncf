import { createApplication } from "@/infrastructure/container";
import { badRequest, errorResponse, jsonResponse } from "../../_shared/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return badRequest("La recherche doit contenir au moins 2 caracteres.");

  try {
    const app = createApplication();
    const stations = await app.searchStations.execute(query);
    return jsonResponse(stations);
  } catch (error) {
    return errorResponse(error);
  }
}
