import { z } from "zod";

const PRODUCTION_SNCF_API_BASE_URL = "https://api.sncf.com/v1";

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  SNCF_API_BASE_URL: z.string().url().default(PRODUCTION_SNCF_API_BASE_URL),
  SNCF_API_TOKEN: z.string().min(1, "SNCF_API_TOKEN is required"),
}).superRefine((config, context) => {
  if (
    config.NODE_ENV === "production" &&
    normalizeBaseUrl(config.SNCF_API_BASE_URL) !== PRODUCTION_SNCF_API_BASE_URL
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SNCF_API_BASE_URL"],
      message: `SNCF_API_BASE_URL must be ${PRODUCTION_SNCF_API_BASE_URL} in production`,
    });
  }
}).transform((config) => ({
  SNCF_API_BASE_URL: normalizeBaseUrl(config.SNCF_API_BASE_URL),
  SNCF_API_TOKEN: config.SNCF_API_TOKEN,
}));

export type ServerConfig = z.infer<typeof serverEnvironmentSchema>;

export const getServerConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig =>
  serverEnvironmentSchema.parse({
    NODE_ENV: env.NODE_ENV,
    SNCF_API_BASE_URL: env.SNCF_API_BASE_URL,
    SNCF_API_TOKEN: env.SNCF_API_TOKEN,
  });
