import { z } from "zod";

export const checkInSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  photoUrl: z.string().min(1, "Foto selfie wajib diambil"),
  note: z.string().max(500).optional(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = checkInSchema;
export type CheckOutInput = z.infer<typeof checkOutSchema>;

export const leaveRequestSchema = z
  .object({
    type: z.enum(["izin", "sakit"], { required_error: "Jenis pengajuan wajib dipilih" }),
    startDate: z.string().min(1, "Tanggal mulai wajib diisi"),
    endDate: z.string().min(1, "Tanggal selesai wajib diisi"),
    reason: z.string().min(5, "Alasan minimal 5 karakter").max(1000),
    attachmentUrl: z.string().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
    path: ["endDate"],
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const decideLeaveRequestSchema = z.object({
  leaveRequestId: z.string().uuid(),
  approve: z.boolean(),
  rejectionReason: z.string().max(500).optional(),
});
export type DecideLeaveRequestInput = z.infer<typeof decideLeaveRequestSchema>;

export const workScheduleSchema = z.object({
  id: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable(),
  name: z.string().min(1, "Nama jadwal wajib diisi").max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Format jam tidak valid"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Format jam tidak valid"),
  lateToleranceMinutes: z.coerce.number().int().min(0).max(180),
  workDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pilih minimal 1 hari kerja"),
  isDefault: z.boolean(),
});
export type WorkScheduleInput = z.infer<typeof workScheduleSchema>;
