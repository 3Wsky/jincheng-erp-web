import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.literal("jincheng-erp-api"),
  status: z.literal("ok"),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

