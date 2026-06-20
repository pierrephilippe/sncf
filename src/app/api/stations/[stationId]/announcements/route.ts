import { createApplication } from "@/infrastructure/container";
import { errorResponse, jsonResponse } from "../../../_shared/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ stationId: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { stationId } = await context.params;
    const app = createApplication();
    const announcements = await app.getStationAnnouncements.execute(decodeURIComponent(stationId));
    return jsonResponse(announcements, 200, 20);
  } catch (error) {
    return errorResponse(error);
  }
}
