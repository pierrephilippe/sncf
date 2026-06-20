import { createApplication } from "@/infrastructure/container";
import { badRequest, errorResponse, jsonResponse } from "../../../_shared/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ stationId: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const page = Number(searchParams.get("page") ?? 0);
  if (!Number.isInteger(page) || page < 0) {
    return badRequest("La page doit etre un entier positif.");
  }

  const fromDateTime = searchParams.get("fromDateTime") ?? undefined;
  if (fromDateTime && Number.isNaN(new Date(fromDateTime).getTime())) {
    return badRequest("La date de debut est invalide.");
  }

  try {
    const { stationId } = await context.params;
    const app = createApplication();
    const announcements = await app.getStationAnnouncements.execute(decodeURIComponent(stationId), {
      fromDateTime,
      page,
      count: 20,
    });
    return jsonResponse(announcements, 200, 20);
  } catch (error) {
    return errorResponse(error);
  }
}
