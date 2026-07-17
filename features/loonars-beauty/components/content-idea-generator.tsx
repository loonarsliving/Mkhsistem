"use client";

import * as React from "react";
import { Loader2, MessageCircleQuestion, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { draftFaqReplyAction, generateContentIdeasAction } from "../actions/loonars-beauty.actions";
import { CONTENT_CATEGORIES, type GenerateContentIdeasInput } from "../schemas/loonars-beauty.schema";

const CATEGORY_LABEL: Record<string, string> = {
  problem_solution: "Problem-Solution",
  ugc: "Testimoni/UGC",
  edukasi: "Edukasi",
  promosi: "Promosi",
};

export function ContentIdeaGenerator({ canManage }: { canManage: boolean }) {
  const [category, setCategory] = React.useState<GenerateContentIdeasInput["category"]>("problem_solution");
  const [context, setContext] = React.useState("");
  const [ideas, setIdeas] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);

  const [question, setQuestion] = React.useState("");
  const [reply, setReply] = React.useState<string | null>(null);
  const [drafting, setDrafting] = React.useState(false);

  if (!canManage) return null;

  async function handleGenerate() {
    setGenerating(true);
    setIdeas(null);
    const result = await generateContentIdeasAction({ category, count: 3, context: context || undefined });
    setGenerating(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Gagal membuat ide konten");
      return;
    }
    setIdeas(result.data.ideas);
  }

  async function handleDraftReply() {
    if (!question.trim()) return;
    setDrafting(true);
    setReply(null);
    const result = await draftFaqReplyAction({ question });
    setDrafting(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Gagal membuat draf balasan");
      return;
    }
    setReply(result.data.reply);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Generate Ide Konten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={category} onValueChange={(v) => setCategory(v as GenerateContentIdeasInput["category"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea placeholder="Konteks tambahan (opsional) -- mis. isu kulit yang lagi ramai dibahas" value={context} onChange={(e) => setContext(e.target.value)} rows={2} />
          <Button disabled={generating} onClick={handleGenerate}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Buat Ide
          </Button>
          {ideas && <p className="whitespace-pre-line rounded-md border border-border bg-muted/40 p-3 text-sm">{ideas}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Draf Balasan WhatsApp/DM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pertanyaan customer masuk otomatis dijawab AI lewat WhatsApp (domain &quot;Loonars Beauty&quot; di Modul AI) -- pakai ini untuk uji coba atau menyiapkan jawaban manual.
          </p>
          <Textarea placeholder="Contoh: apakah aman untuk kulit sensitif?" value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} />
          <Button disabled={drafting || !question.trim()} onClick={handleDraftReply}>
            {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleQuestion className="h-4 w-4" />}
            Buat Draf Balasan
          </Button>
          {reply && <p className="whitespace-pre-line rounded-md border border-border bg-muted/40 p-3 text-sm">{reply}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
