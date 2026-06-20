import type { BoardType } from "@/domain/types";
import { createApplication } from "@/infrastructure/container";
import { badRequest, errorResponse, jsonResponse } from "../../../_shared/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ stationId: string }>;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const type = new URL(request.url).searchParams.get("type") ?? "departures";
  if (type !== "departures" && type !== "arrivals") {
    return badRequest("Le type doit etre departures ou arrivals.");
  }

  try {
    const { stationId } = await context.params;
    const app = createApplication();
    const board = await app.getStationBoard.execute(decodeURIComponent(stationId), type as BoardType);
    return jsonResponse(board, 200, 20);
  } catch (error) {
    return errorResponse(error);
  }
}
