import { createApplication } from "@/infrastructure/container";
import { badRequest, errorResponse, jsonResponse } from "../../_shared/http";
import { checkRateLimit } from "../../_shared/rateLimit";
import { stationSearchQuerySchema, validationMessage } from "../../_shared/validation";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rateLimitResponse = checkRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const parsedQuery = stationSearchQuerySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsedQuery.success) return badRequest(validationMessage(parsedQuery.error));

  try {
    const app = createApplication();
    const stations = await app.searchStations.execute(parsedQuery.data);
    return jsonResponse(stations);
  } catch (error) {
    return errorResponse(error);
  }
}
