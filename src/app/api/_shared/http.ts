import { ZodError } from "zod";
import type { AppError } from "@/domain/result";

export const jsonResponse = <T>(body: T, status = 200, cacheSeconds = 30): Response =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=60`,
    },
  });

export const errorResponse = (error: unknown): Response => {
  if (isAppError(error)) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: "La reponse de l'API SNCF est invalide.", code: "validation" },
      { status: 502 },
    );
  }

  return Response.json({ error: "Erreur serveur inattendue.", code: "server_error" }, { status: 500 });
};

export const badRequest = (message: string): Response =>
  Response.json({ error: message, code: "bad_request" }, { status: 400 });

const isAppError = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  "message" in error &&
  "status" in error;
