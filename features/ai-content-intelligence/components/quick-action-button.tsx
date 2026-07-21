import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface QuickActionButtonProps {
  label: string;
  icon: LucideIcon;
}

export function QuickActionButton({ label, icon: Icon }: QuickActionButtonProps) {
  return (
    <Button variant="outline" className="h-auto justify-start gap-2 py-3" disabled>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Button>
  );
}
