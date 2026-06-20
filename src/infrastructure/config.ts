import { z } from "zod";

const serverConfigSchema = z.object({
  SNCF_API_BASE_URL: z.string().url().default("https://api.sncf.com/v1"),
  SNCF_API_TOKEN: z.string().min(1, "SNCF_API_TOKEN is required"),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export const getServerConfig = (): ServerConfig =>
  serverConfigSchema.parse({
    SNCF_API_BASE_URL: process.env.SNCF_API_BASE_URL,
    SNCF_API_TOKEN: process.env.SNCF_API_TOKEN,
  });
