import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RoadmapItem {
  sprint: string;
  label: string;
}

const ROADMAP_ITEMS: RoadmapItem[] = [
  { sprint: "Sprint 0", label: "Architecture" },
  { sprint: "Sprint 1", label: "Asset Library" },
  { sprint: "Sprint 2", label: "Gemini Vision" },
  { sprint: "Sprint 3", label: "AI Director" },
  { sprint: "Sprint 4", label: "Storyboard" },
  { sprint: "Sprint 5", label: "Asset Selector" },
  { sprint: "Sprint 6", label: "Render Engine" },
  { sprint: "Sprint 7", label: "Publishing" },
  { sprint: "Sprint 8", label: "Learning" },
];

export function RoadmapPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Development Roadmap</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {ROADMAP_ITEMS.map((item, index) => (
            <li key={item.sprint} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium">
                  {index}
                </div>
                {index < ROADMAP_ITEMS.length - 1 && <div className="w-px flex-1 bg-border" />}
              </div>
              <div className="pb-1">
                <p className="text-xs font-medium text-muted-foreground">{item.sprint}</p>
                <p className="text-sm font-medium">{item.label}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
