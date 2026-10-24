"use client";

import * as React from "react";

import type { ChatPerson, ChatUnit } from "@/repositories/chat.repository";

export interface ChatContextValue {
  conversationId: string;
  conversationKind: "operational_group" | "owner_feed" | "direct";
  departmentCode: string;
  userId: string;
  /** Caller's role in the department's operational group (null for the owner). */
  myRole: string | null;
  isOwner: boolean;
  people: ChatPerson[];
  units: ChatUnit[];
  /** Re-fetch messages + open work after a mutation. */
  refresh: () => void;
}

const ChatContext = React.createContext<ChatContextValue | null>(null);

export function ChatContextProvider({ value, children }: { value: ChatContextValue; children: React.ReactNode }) {
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = React.useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatContextProvider");
  return ctx;
}

export function personName(people: ChatPerson[], id: string | null | undefined): string {
  if (!id) return "—";
  return people.find((p) => p.id === id)?.name ?? "Anggota";
}
