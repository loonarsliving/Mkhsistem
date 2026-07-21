import {
  BarChart3,
  Clapperboard,
  FolderKanban,
  GraduationCap,
  Image as ImageIcon,
  Images,
  ListVideo,
  Send,
  Sparkles,
  UploadCloud,
  Video,
  Wand2,
} from "lucide-react";

import { ModuleCard } from "@/features/ai-content-intelligence/components/module-card";
import { QuickActionButton } from "@/features/ai-content-intelligence/components/quick-action-button";
import { RoadmapPanel } from "@/features/ai-content-intelligence/components/roadmap-panel";
import { StatTile } from "@/features/ai-content-intelligence/components/stat-tile";

const STATS = [
  { label: "Total Assets", value: "0", icon: Images },
  { label: "Images", value: "0", icon: ImageIcon },
  { label: "Videos", value: "0", icon: Video },
  { label: "Ready To Render", value: "0", icon: ListVideo },
  { label: "Rendered Today", value: "0", icon: Clapperboard },
  { label: "Published Today", value: "0", icon: Send },
];

const QUICK_ACTIONS = [
  { label: "Upload Assets", icon: UploadCloud },
  { label: "Open Asset Library", icon: FolderKanban },
  { label: "Generate Content", icon: Wand2 },
  { label: "Render Queue", icon: ListVideo },
  { label: "Learning Engine", icon: GraduationCap },
];

const MODULES = [
  { title: "Asset Library", description: "Simpan, atur, dan cari seluruh aset foto & video di satu tempat.", icon: FolderKanban },
  { title: "Gemini Vision", description: "Analisis visual otomatis untuk memahami isi dan kualitas aset.", icon: Sparkles },
  { title: "AI Director", description: "Rekomendasi arahan konten berbasis AI untuk setiap campaign.", icon: Wand2 },
  { title: "Storyboard Engine", description: "Susun alur cerita konten secara otomatis dari aset yang tersedia.", icon: Clapperboard },
  { title: "Asset Selector", description: "Pilih kombinasi aset terbaik untuk setiap format konten.", icon: Images },
  { title: "Render Engine", description: "Proses rendering otomatis dari storyboard menjadi konten jadi.", icon: Video },
  { title: "Publishing Center", description: "Jadwalkan dan publikasikan konten ke seluruh platform.", icon: Send },
  { title: "Learning Engine", description: "Pelajari performa konten untuk meningkatkan rekomendasi berikutnya.", icon: GraduationCap },
  { title: "Analytics", description: "Pantau performa produksi dan publikasi konten AI secara menyeluruh.", icon: BarChart3 },
];

export function AiContentIntelligenceDashboard() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {STATS.map((stat) => (
            <StatTile key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
          ))}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((action) => (
              <QuickActionButton key={action.label} label={action.label} icon={action.icon} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Modules</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {MODULES.map((module) => (
              <ModuleCard key={module.title} title={module.title} description={module.description} icon={module.icon} />
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-1">
        <RoadmapPanel />
      </div>
    </div>
  );
}
