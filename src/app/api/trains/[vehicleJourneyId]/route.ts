import { createApplication } from "@/infrastructure/container";
import { badRequest, errorResponse, jsonResponse } from "../../_shared/http";
import { checkRateLimit } from "../../_shared/rateLimit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ vehicleJourneyId: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const rateLimitResponse = checkRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { vehicleJourneyId } = await context.params;
    const decodedVehicleJourneyId = decodeURIComponent(vehicleJourneyId);
    if (!decodedVehicleJourneyId.trim()) {
      return badRequest("L'identifiant du train est manquant.");
    }

    const app = createApplication();
    const details = await app.getTrainDetails.execute(decodedVehicleJourneyId);
    return jsonResponse(details, 200, 20);
  } catch (error) {
    return errorResponse(error);
  }
}
