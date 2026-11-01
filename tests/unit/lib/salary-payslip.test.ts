import { describe, expect, it } from "vitest";

import { parseTransferListRecognition } from "@/lib/ai/domains/salary-transfer-list-recognition";
import {
  accountDigits,
  buildPayslipAdminReply,
  maskAccount,
  matchSalaryTransfers,
  payslipNumber,
  type RecognizedTransferRow,
  type SalaryCandidate,
} from "@/lib/salary/payslip-format";

// Fictional names / accounts only -- this repository is public.
const row = (namaPenerima: string, rekening: string | null, nominal: number | null): RecognizedTransferRow => ({ namaPenerima, bank: "BCA", rekening, nominal });
const cand = (id: string, account: string, amount: number, month = 11, status: SalaryCandidate["status"] = "pending_transfer"): SalaryCandidate => ({
  id,
  status,
  amount,
  bankAccountNumber: account,
  periodMonth: month,
  periodYear: 2026,
});

describe("accountDigits / maskAccount", () => {
  it("reads the longest digit run, tolerating spaces and dots", () => {
    expect(accountDigits("BCA • 1234 567 890")).toBe("1234567890");
    expect(accountDigits("123.456.7890")).toBe("1234567890");
    expect(accountDigits("abc 12")).toBeNull();
    expect(accountDigits(null)).toBeNull();
  });

  it("only ever shows the last four digits", () => {
    expect(maskAccount("1234567890")).toBe("•••• 7890");
  });
});

describe("matchSalaryTransfers", () => {
  it("matches a bulk screenshot on account + amount, never amount alone", () => {
    const rows = [row("ANI", "1111111111", 2_000_000), row("BUDI", "2222222222", 2_000_000), row("CICI", "3333333333", 8_000_000)];
    const candidates = [cand("a", "1111111111", 2_000_000), cand("b", "2222222222", 2_000_000), cand("c", "9999999999", 8_000_000)];
    const result = matchSalaryTransfers(rows, candidates);
    expect(result.map((r) => r.kind)).toEqual(["matched", "matched", "unmatched"]);
    expect(result[0]).toMatchObject({ submissionId: "a" });
    expect(result[1]).toMatchObject({ submissionId: "b" });
  });

  it("rejects a different amount on the right account", () => {
    expect(matchSalaryTransfers([row("ANI", "1111111111", 2_500_000)], [cand("a", "1111111111", 2_000_000)])[0].kind).toBe("unmatched");
  });

  it("uses the batch period when an older unpaid period has the same account + amount", () => {
    const rows = [row("ANI", "1111111111", 3_000_000), row("BUDI", "2222222222", 2_000_000), row("CICI", "3333333333", 4_000_000)];
    const candidates = [
      cand("ani-okt", "1111111111", 3_000_000, 10),
      cand("ani-nov", "1111111111", 3_000_000, 11),
      cand("budi-nov", "2222222222", 2_000_000, 11),
      cand("cici-nov", "3333333333", 4_000_000, 11),
    ];
    expect(matchSalaryTransfers(rows, candidates)[0]).toMatchObject({ kind: "matched", submissionId: "ani-nov" });
  });

  it("reports ambiguous instead of guessing when the batch can't decide", () => {
    const candidates = [cand("okt", "1111111111", 3_000_000, 10), cand("nov", "1111111111", 3_000_000, 11)];
    expect(matchSalaryTransfers([row("ANI", "1111111111", 3_000_000)], candidates)[0].kind).toBe("ambiguous");
  });

  it("recognises rows already paid from an earlier, overlapping screenshot", () => {
    const candidates = [cand("a", "1111111111", 2_000_000, 11, "transferred"), cand("b", "2222222222", 2_000_000)];
    const result = matchSalaryTransfers([row("ANI", "1111111111", 2_000_000), row("BUDI", "2222222222", 2_000_000)], candidates);
    expect(result.map((r) => r.kind)).toEqual(["already_transferred", "matched"]);
  });

  it("never lets two rows claim the same submission", () => {
    const result = matchSalaryTransfers([row("ANI", "1111111111", 2_000_000), row("ANI", "1111111111", 2_000_000)], [cand("a", "1111111111", 2_000_000)]);
    expect(result.map((r) => r.kind)).toEqual(["matched", "unmatched"]);
  });

  it("skips rows whose account number couldn't be read", () => {
    expect(matchSalaryTransfers([row("ANI", null, 2_000_000)], [cand("a", "1111111111", 2_000_000)])[0].kind).toBe("unmatched");
  });
});

describe("parseTransferListRecognition", () => {
  it("drops failed rows and non-numeric amounts", () => {
    const parsed = parseTransferListRecognition(
      '```json\n{"readable": true, "transfers": [{"namaPenerima": "ANI", "bank": "BCA", "rekening": "1111111111", "nominal": 2000000, "status": "berhasil"}, {"namaPenerima": "BUDI", "rekening": "2", "nominal": 5, "status": "gagal"}, {"namaPenerima": "CICI", "nominal": "abc"}]}\n```',
    );
    expect(parsed.readable).toBe(true);
    expect(parsed.rows).toEqual([
      { namaPenerima: "ANI", bank: "BCA", rekening: "1111111111", nominal: 2_000_000 },
      { namaPenerima: "CICI", bank: null, rekening: null, nominal: null },
    ]);
  });

  it("throws on non-JSON output", () => {
    expect(() => parseTransferListRecognition("maaf")).toThrow();
  });
});

describe("payslip text", () => {
  it("builds a stable slip number", () => {
    expect(payslipNumber("e911a2bb-0000-4000-8000-000000000000", 3, 2027)).toBe("SG-202703-E911A2BB");
  });

  it("summarises sent, duplicate and problem rows for Super Admin", () => {
    const text = buildPayslipAdminReply({
      sent: [
        { name: "Ani", amount: 2_000_000, periode: "November 2026", delivered: true },
        { name: "Budi", amount: 1_000_000, periode: "November 2026", delivered: false, error: "nomor WA karyawan belum ada" },
      ],
      alreadyTransferred: ["Cici"],
      problems: ["DODI — Rp 500.000"],
    });
    expect(text).toContain("2 gaji dicatat sudah ditransfer (total Rp 3.000.000)");
    expect(text).toContain("slip GAGAL terkirim: nomor WA karyawan belum ada");
    expect(text).toContain("Sudah tercatat sebelumnya");
    expect(text).toContain("DODI — Rp 500.000");
  });
});
