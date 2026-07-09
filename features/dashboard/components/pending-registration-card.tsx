import Link from "next/link";
import { UserCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function PendingRegistrationCard({ count }: { count: number }) {
  return (
    <Link href="/registrations" className="block">
      <Card className="transition-colors hover:border-primary">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{count}</p>
            <p className="text-sm text-muted-foreground">Pending Registration</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
