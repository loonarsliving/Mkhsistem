"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TARGET_TYPE, type TargetType } from "@/constants/app";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";
import { listDivisionsAction } from "@/features/divisions/actions/division-query.actions";
import { searchEmployeesAction } from "@/features/employees/actions/employee-query.actions";
import { listPositionsAction } from "@/features/positions/actions/position-query.actions";
import { useDebounce } from "@/hooks/use-debounce";

export interface TargetValue {
  target_type: TargetType;
  target_id: string | null;
  label: string;
}

const TARGET_TYPE_LABEL: Record<TargetType, string> = {
  all_branch: "Semua Cabang",
  branch: "Cabang Tertentu",
  all_division: "Semua Divisi",
  division: "Divisi Tertentu",
  position: "Jabatan Tertentu",
  user: "Karyawan Tertentu",
};

interface TargetPickerProps {
  /** Minimal shape the form/schema needs; labels are tracked internally for display. */
  onChange: (value: { target_type: TargetType; target_id: string | null }[]) => void;
  defaultValue?: TargetValue[];
}

export function TargetPicker({ onChange, defaultValue }: TargetPickerProps) {
  const [selected, setSelected] = React.useState<TargetValue[]>(defaultValue ?? []);
  const [pendingType, setPendingType] = React.useState<TargetType>(TARGET_TYPE.ALL_BRANCH);
  const [pendingId, setPendingId] = React.useState<string>("");
  const [userSearch, setUserSearch] = React.useState("");
  const debouncedUserSearch = useDebounce(userSearch, 300);

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction });
  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: listDivisionsAction });
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: listPositionsAction });
  const { data: userResults } = useQuery({
    queryKey: ["employee-search", debouncedUserSearch],
    queryFn: () => searchEmployeesAction(debouncedUserSearch),
    enabled: pendingType === TARGET_TYPE.USER && debouncedUserSearch.length >= 2,
  });

  const needsSecondarySelect = pendingType !== TARGET_TYPE.ALL_BRANCH && pendingType !== TARGET_TYPE.ALL_DIVISION;

  function handleAdd() {
    if (needsSecondarySelect && !pendingId) return;

    let label = TARGET_TYPE_LABEL[pendingType];
    if (pendingType === TARGET_TYPE.BRANCH) label = branches?.find((b) => b.id === pendingId)?.name ?? label;
    if (pendingType === TARGET_TYPE.DIVISION) label = divisions?.find((d) => d.id === pendingId)?.name ?? label;
    if (pendingType === TARGET_TYPE.POSITION) label = positions?.find((p) => p.id === pendingId)?.name ?? label;
    if (pendingType === TARGET_TYPE.USER) label = userResults?.find((u) => u.id === pendingId)?.full_name ?? label;

    const targetId = needsSecondarySelect ? pendingId : null;
    const exists = selected.some((v) => v.target_type === pendingType && v.target_id === targetId);
    if (!exists) {
      const next = [...selected, { target_type: pendingType, target_id: targetId, label }];
      setSelected(next);
      onChange(next.map(({ target_type, target_id }) => ({ target_type, target_id })));
    }
    setPendingId("");
    setUserSearch("");
  }

  function handleRemove(index: number) {
    const next = selected.filter((_, i) => i !== index);
    setSelected(next);
    onChange(next.map(({ target_type, target_id }) => ({ target_type, target_id })));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Select
            value={pendingType}
            onValueChange={(v) => {
              setPendingType(v as TargetType);
              setPendingId("");
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TARGET_TYPE_LABEL).map(([type, label]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pendingType === TARGET_TYPE.BRANCH && (
          <Select value={pendingId} onValueChange={setPendingId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Pilih cabang" />
            </SelectTrigger>
            <SelectContent>
              {branches?.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pendingType === TARGET_TYPE.DIVISION && (
          <Select value={pendingId} onValueChange={setPendingId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Pilih divisi" />
            </SelectTrigger>
            <SelectContent>
              {divisions?.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pendingType === TARGET_TYPE.POSITION && (
          <Select value={pendingId} onValueChange={setPendingId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Pilih jabatan" />
            </SelectTrigger>
            <SelectContent>
              {positions?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {pendingType === TARGET_TYPE.USER && (
          <div className="w-56 space-y-1">
            <Input placeholder="Cari nama karyawan..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            {userResults && userResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-border">
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setPendingId(u.id);
                      setUserSearch(u.full_name);
                    }}
                    className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-accent ${pendingId === u.id ? "bg-accent" : ""}`}
                  >
                    {u.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Button type="button" variant="outline" onClick={handleAdd} disabled={needsSecondarySelect && !pendingId}>
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((target, index) => (
            <span
              key={`${target.target_type}-${target.target_id}-${index}`}
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
            >
              {TARGET_TYPE_LABEL[target.target_type]}
              {target.target_id && `: ${target.label}`}
              <button type="button" onClick={() => handleRemove(index)} aria-label="Hapus target">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
