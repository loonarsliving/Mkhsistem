"use client";

import * as React from "react";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateCreativeBrief } from "@/features/kontenai/ai-director/hooks/use-creative-brief-mutations";
import { OBJECTIVE_OPTIONS, PLATFORM_OPTIONS } from "@/features/kontenai/ai-director/types";
import type { DirectorObjective, DirectorPlatform } from "@/lib/ai/domains/kontenai-director";

const INITIAL_OBJECTIVE: DirectorObjective = "brand_awareness";
const INITIAL_PLATFORM: DirectorPlatform = "instagram";

/** The campaign intent form -- AI Director's only input. Generating a brief keeps the form values so the user can tweak one field and regenerate. */
export function CreativeBriefForm() {
  const generateMutation = useGenerateCreativeBrief();

  const [objective, setObjective] = React.useState<DirectorObjective>(INITIAL_OBJECTIVE);
  const [platform, setPlatform] = React.useState<DirectorPlatform>(INITIAL_PLATFORM);
  const [targetAudience, setTargetAudience] = React.useState("");
  const [productProject, setProductProject] = React.useState("");
  const [campaignGoal, setCampaignGoal] = React.useState("");

  const canSubmit = targetAudience.trim() && productProject.trim() && campaignGoal.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    generateMutation.mutate({
      objective,
      platform,
      targetAudience: targetAudience.trim(),
      productProject: productProject.trim(),
      campaignGoal: campaignGoal.trim(),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wand2 className="h-4 w-4 text-primary" />
          Campaign Intent
        </CardTitle>
        <CardDescription>AI Director membaca Asset Library & hasil Gemini Vision, lalu menyusun Creative Brief sesuai intent di bawah.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="director-objective">Objective</Label>
              <Select value={objective} onValueChange={(value) => setObjective(value as DirectorObjective)}>
                <SelectTrigger id="director-objective">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="director-platform">Platform</Label>
              <Select value={platform} onValueChange={(value) => setPlatform(value as DirectorPlatform)}>
                <SelectTrigger id="director-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="director-audience">Target Audience</Label>
            <Textarea
              id="director-audience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              rows={2}
              placeholder="Contoh: mahasiswa & pekerja muda usia 20-30 tahun yang mencari kos dekat kampus/kantor"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="director-product">Product/Project</Label>
            <Textarea
              id="director-product"
              value={productProject}
              onChange={(e) => setProductProject(e.target.value)}
              rows={1}
              placeholder="Contoh: Kos Melati Residence, atau Loonars Beauty - Serum Niacinamide"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="director-goal">Campaign Goal</Label>
            <Textarea
              id="director-goal"
              value={campaignGoal}
              onChange={(e) => setCampaignGoal(e.target.value)}
              rows={2}
              placeholder="Contoh: menaikkan booking survey unit kosong bulan ini"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit || generateMutation.isPending}>
            <Wand2 className="h-4 w-4" />
            {generateMutation.isPending ? "AI Director sedang menyusun brief..." : "Generate Creative Brief"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
