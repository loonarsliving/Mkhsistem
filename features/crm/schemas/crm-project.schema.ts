import { z } from "zod";

import { PROJECT_TYPE, PROJECT_STATUS } from "@/constants/app";

export const crmProjectSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Nama project minimal 2 karakter").max(200),
  city: z.string().max(100).optional(),
  branchId: z.string().uuid("Cabang wajib dipilih"),
  projectType: z.enum(Object.values(PROJECT_TYPE) as [string, ...string[]], { required_error: "Tipe project wajib dipilih" }),
  status: z.enum(Object.values(PROJECT_STATUS) as [string, ...string[]], { required_error: "Status wajib dipilih" }),
  startDate: z.string().optional(),
  targetLaunchDate: z.string().optional(),
});
export type CrmProjectInput = z.infer<typeof crmProjectSchema>;
