import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AttendanceStatusBadge,
  EmploymentStatusBadge,
  LeaveStatusBadge,
  PriorityBadge,
} from "@/components/shared/status-badge";

describe("AttendanceStatusBadge", () => {
  it.each([
    ["hadir", "Hadir"],
    ["terlambat", "Terlambat"],
    ["izin", "Izin"],
    ["sakit", "Sakit"],
    ["alpha", "Alpha"],
  ] as const)("renders the Indonesian label for status %s", (status, label) => {
    render(<AttendanceStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("EmploymentStatusBadge", () => {
  it("renders 'Aktif' for an active employee", () => {
    render(<EmploymentStatusBadge status="active" />);
    expect(screen.getByText("Aktif")).toBeInTheDocument();
  });

  it("renders 'Berhenti' for a terminated employee", () => {
    render(<EmploymentStatusBadge status="terminated" />);
    expect(screen.getByText("Berhenti")).toBeInTheDocument();
  });
});

describe("LeaveStatusBadge", () => {
  it("renders 'Menunggu' while pending", () => {
    render(<LeaveStatusBadge status="pending" />);
    expect(screen.getByText("Menunggu")).toBeInTheDocument();
  });

  it("renders 'Disetujui' when approved", () => {
    render(<LeaveStatusBadge status="approved" />);
    expect(screen.getByText("Disetujui")).toBeInTheDocument();
  });
});

describe("PriorityBadge", () => {
  it("renders 'Mendesak' for urgent priority", () => {
    render(<PriorityBadge priority="urgent" />);
    expect(screen.getByText("Mendesak")).toBeInTheDocument();
  });
});
