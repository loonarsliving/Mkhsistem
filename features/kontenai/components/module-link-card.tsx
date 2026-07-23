import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ModuleLinkCardProps {
  sprint: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

export function ModuleLinkCard({ sprint, title, description, icon: Icon, href }: ModuleLinkCardProps) {
  return (
    <Link href={href} className="block">
      <Card className="flex h-full flex-col transition-colors hover:border-primary/40 hover:bg-accent/40">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Badge variant="outline">{sprint}</Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
      </Card>
    </Link>
  );
}
