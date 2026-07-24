import {
  BarChart3,
  Boxes,
  CalendarDays,
  Clapperboard,
  Compass,
  FileText,
  FolderKanban,
  GraduationCap,
  Images,
  Layers,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";

import { AutomationToggle } from "@/features/kontenai/components/automation-toggle";
import { ModuleLinkCard } from "@/features/kontenai/components/module-link-card";
import { PipelineFlow } from "@/features/kontenai/components/pipeline-flow";
import { StatTile } from "@/features/kontenai/components/stat-tile";

const STATS = [
  { label: "Active Pipeline Runs", value: "0", icon: Layers },
  { label: "Assets in Library", value: "0", icon: Images },
  { label: "Storyboards Drafted", value: "0", icon: Compass },
  { label: "Rendered Today", value: "0", icon: Clapperboard },
  { label: "Sent to Content Studio", value: "0", icon: Send },
  { label: "Revisions Requested", value: "0", icon: Wand2 },
];

const MODULES = [
  {
    sprint: "Sprint 1",
    title: "Asset Library",
    description: "Pusat penyimpanan seluruh foto, video, audio, logo, dan template produksi.",
    icon: FolderKanban,
    href: "/kontenai/asset-library",
  },
  {
    sprint: "Sprint 2",
    title: "Gemini Vision",
    description: "Analisis visual otomatis untuk memberi metadata pada setiap aset agar mudah dicari.",
    icon: Sparkles,
    href: "/kontenai/gemini-vision",
  },
  {
    sprint: "Sprint 3",
    title: "AI Director",
    description: "Membaca hasil Content Planner & Content Audit lalu menyusun arahan produksi konten.",
    icon: Wand2,
    href: "/kontenai/ai-director",
  },
  {
    sprint: "Sprint 4",
    title: "Storyboard Engine",
    description: "Mengubah arahan AI Director menjadi storyboard: urutan scene, teks, durasi, transisi.",
    icon: Compass,
    href: "/kontenai/storyboard-engine",
  },
  {
    sprint: "Sprint 5",
    title: "Asset Selector",
    description: "Memilih aset terbaik dari Asset Library sesuai kebutuhan tiap scene storyboard.",
    icon: Boxes,
    href: "/kontenai/asset-selector",
  },
  {
    sprint: "Sprint 6",
    title: "Render Engine",
    description: "Merender storyboard yang sudah lengkap menjadi video final siap tayang.",
    icon: Clapperboard,
    href: "/kontenai/render-engine",
  },
  {
    sprint: "Sprint 7",
    title: "Publishing Engine",
    description: "Jadwalkan video hasil Render Engine untuk publish -- caption & hashtag AI, platform tujuan, tanggal/jam publish.",
    icon: Send,
    href: "/kontenai/publishing-engine",
  },
  {
    sprint: "Sprint 7",
    title: "Content Calendar",
    description: "Seluruh jadwal publish dan statusnya -- Draft, Scheduled, Published, Failed.",
    icon: CalendarDays,
    href: "/kontenai/content-calendar",
  },
  {
    sprint: "Sprint 7 (lama)",
    title: "Production Pipeline",
    description: "Menghubungkan seluruh proses produksi dan mengirim hasil render ke Content Studio.",
    icon: Layers,
    href: "/kontenai/production-pipeline",
  },
  {
    sprint: "Sprint 8",
    title: "Learning Engine",
    description: "Menyimpan hasil produksi, feedback Content Studio, dan performa agar AI terus belajar.",
    icon: GraduationCap,
    href: "/kontenai/learning-engine",
  },
  {
    sprint: "Sprint 9",
    title: "Analytics Dashboard",
    description: "Pusat monitoring KPI, tren performa per periode, serta konten dengan performa terbaik dan terburuk.",
    icon: BarChart3,
    href: "/kontenai/analytics",
  },
  {
    sprint: "Sprint 9",
    title: "AI Optimization",
    description: "AI Recommendation berbasis riwayat Learning Engine -- Hook, Caption, CTA, Durasi, Visual Style, Posting Time.",
    icon: Wand2,
    href: "/kontenai/ai-optimization",
  },
  {
    sprint: "Sprint 9",
    title: "AI Report",
    description: "Rangkuman performa mingguan dan bulanan seluruh konten KontenAI.",
    icon: FileText,
    href: "/kontenai/ai-report",
  },
];

interface KontenAiDashboardProps {
  automationEnabled: boolean;
}

export function KontenAiDashboard({ automationEnabled }: KontenAiDashboardProps) {
  return (
    <div className="space-y-6">
      <AutomationToggle initialEnabled={automationEnabled} />
      <PipelineFlow />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((module) => (
            <ModuleLinkCard key={module.title} {...module} />
          ))}
        </div>
      </div>
    </div>
  );
}
