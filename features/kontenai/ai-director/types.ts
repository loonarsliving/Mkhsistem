import type { DirectorObjective, DirectorPlatform } from "@/lib/ai/domains/kontenai-director";

export interface CreativeBriefFormOption<T extends string> {
  value: T;
  label: string;
}

export const OBJECTIVE_OPTIONS: CreativeBriefFormOption<DirectorObjective>[] = [
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "leads", label: "Leads" },
  { value: "sales", label: "Sales" },
  { value: "engagement", label: "Engagement" },
];

export const PLATFORM_OPTIONS: CreativeBriefFormOption<DirectorPlatform>[] = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
];

export function objectiveLabel(value: string): string {
  return OBJECTIVE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function platformLabel(value: string): string {
  return PLATFORM_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
