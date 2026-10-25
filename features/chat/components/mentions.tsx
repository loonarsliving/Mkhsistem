"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { ChatPerson } from "@/repositories/chat.repository";

import { avatarColor, initials } from "./chat-utils";

/**
 * Tagging people in a chat (0305). Typing "@" in the composer opens a list of
 * the conversation's members; picking one writes "@Full Name" into the text
 * and remembers the person. The tagged ids travel with the message
 * (payload.mentions) so the push can tell them and the bubble can highlight
 * the name -- the text alone is never trusted to say who was tagged.
 */

export interface PickedMention {
  id: string;
  name: string;
}

/** "@query" being typed right before the caret (start = index of "@"), or null. */
export function findMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}

/** Members who can be tagged: active, in the conversation, not the caller; one entry per person. */
export function mentionCandidates(people: ChatPerson[], userId: string, query: string, limit = 6): ChatPerson[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: ChatPerson[] = [];
  for (const p of people) {
    if (!p.active || p.role === null || p.id === userId || seen.has(p.id)) continue;
    if (q && !p.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(q)) && !p.name.toLowerCase().startsWith(q)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Text with "@query" (from start to caret) replaced by "@Name ", and the caret position after it. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

/** Ids of picked people whose "@Name" is still in the text when it is sent. */
export function mentionIdsInText(text: string, picked: PickedMention[]): string[] {
  return [...new Set(picked.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id))];
}

/** Message text with every "@Name" of a tagged person highlighted (stronger when it is the reader). */
export function MentionText({ body, mentions, people, userId }: { body: string; mentions: string[]; people: ChatPerson[]; userId: string }) {
  const tagged = mentions
    .map((id) => ({ id, name: people.find((p) => p.id === id)?.name }))
    .filter((m): m is { id: string; name: string } => !!m.name)
    // longest first so "@Fety Puspitasari" wins over a shorter "@Fety"
    .sort((a, b) => b.name.length - a.name.length);
  if (tagged.length === 0) return <>{body}</>;
  const pattern = new RegExp(`@(${tagged.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(body.slice(last, at));
    const person = tagged.find((m) => m.name === match[1]);
    parts.push(
      <span
        key={`${at}-${match[1]}`}
        className={cn(
          "rounded px-0.5 font-semibold text-emerald-700 dark:text-emerald-400",
          person?.id === userId && "bg-amber-200/70 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100",
        )}
      >
        {match[0]}
      </span>,
    );
    last = at + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <>{parts}</>;
}

/** The member list shown above the composer while "@..." is being typed. */
export function MentionPicker({ candidates, onPick }: { candidates: ChatPerson[]; onPick: (p: ChatPerson) => void }) {
  if (candidates.length === 0) return null;
  return (
    <div role="listbox" aria-label="Tandai anggota" className="mx-2 mt-2 max-h-56 overflow-y-auto rounded-xl border bg-background shadow-lg">
      {candidates.map((p, i) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={i === 0}
          // keep the textarea focused (and the keyboard open) while picking
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(p)}
          className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted", i === 0 && "bg-muted/60")}
        >
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", avatarColor(p.name))}>{initials(p.name)}</span>
          <span className="truncate font-medium">{p.name}</span>
        </button>
      ))}
    </div>
  );
}
