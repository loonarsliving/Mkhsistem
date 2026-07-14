"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { updateSystemPromptAction } from "../actions/ai-module.actions";
import type { UpdateSystemPromptInput } from "../schemas/ai-module.schema";

export interface SystemPromptRow {
  key: string;
  label: string;
  content: string;
  updated_at: string;
}

export function SystemPromptForm({ prompts }: { prompts: SystemPromptRow[] }) {
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(prompts.map((p) => [p.key, p.content])),
  );
  const [submittingKey, setSubmittingKey] = React.useState<string | null>(null);

  async function handleSave(key: string) {
    setSubmittingKey(key);
    const result = await updateSystemPromptAction({ key, content: values[key] } as UpdateSystemPromptInput);
    setSubmittingKey(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan instruksi AI");
      return;
    }
    toast.success("Instruksi AI berhasil disimpan");
  }

  return (
    <Tabs defaultValue={prompts[0]?.key}>
      <TabsList>
        {prompts.map((p) => (
          <TabsTrigger key={p.key} value={p.key}>
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {prompts.map((p) => (
        <TabsContent key={p.key} value={p.key}>
          <Card>
            <CardContent className="space-y-3 p-6">
              <Textarea
                value={values[p.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [p.key]: e.target.value }))}
                rows={14}
                className="font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Terakhir diubah: {new Date(p.updated_at).toLocaleString("id-ID")}
                </p>
                <Button onClick={() => handleSave(p.key)} disabled={submittingKey === p.key}>
                  {submittingKey === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Simpan
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
