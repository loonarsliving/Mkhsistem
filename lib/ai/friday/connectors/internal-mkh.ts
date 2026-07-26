import "server-only";

import { captureSignalSnapshot, renderSnapshotForPrompt } from "../signals";
import {
  HOLDING_METRIC_KEYS,
  metric,
  type BusinessConnector,
  type BusinessRegistration,
  type BusinessSnapshot,
  type ConnectorAutomation,
  type ConnectorStatus,
  type NormalizedMetric,
} from "./types";

/**
 * The Developer business (MK Connect / MKH System), expressed as a connector.
 *
 * This file is the proof that the connector abstraction is real rather than
 * aspirational: the business FRIDAY was originally built directly on top of
 * now reaches it through exactly the same four verbs a future Villa PMS will.
 * Nothing in signals.ts, analyst.ts, prompt.ts, or briefing.ts changed to make
 * that true — this is a pure adapter over captureSignalSnapshot().
 *
 * That also means the existing company-scope briefing is untouched. It still
 * calls captureSignalSnapshot() directly and still produces exactly the
 * briefing it produced yesterday. The holding layer is additive; if it were
 * deleted tomorrow, FRIDAY would behave as it did before.
 *
 * The mapping below is the only interesting part, and it is deliberately
 * lossy in one direction and lossless in the other:
 *
 *   - metrics[]  loses MK Connect's structure to gain comparability. Only the
 *                figures that mean the same thing in a coffee shop as in a
 *                property developer survive the trip.
 *   - narrative  keeps everything, verbatim, by reusing renderSnapshotForPrompt.
 *                So depth is not sacrificed for comparability — both are sent.
 */
export class InternalMkhConnector implements BusinessConnector {
  readonly kind = "internal_mkh";

  constructor(private readonly registration: BusinessRegistration) {}

  async fetchSnapshot(): Promise<BusinessSnapshot> {
    const base = {
      businessKey: this.registration.key,
      businessName: this.registration.name,
      businessType: this.registration.businessType,
      capturedAt: new Date().toISOString(),
    };

    try {
      const snapshot = await captureSignalSnapshot();
      const failedSections = Object.entries({
        crm: snapshot.crm,
        ads: snapshot.ads,
        finance: snapshot.finance,
        hr: snapshot.hr,
        markom: snapshot.markom,
        occupancy: snapshot.occupancy,
        automation: snapshot.automation,
      })
        .filter(([, section]) => section.error !== null)
        .map(([name]) => name);

      return {
        ...base,
        // Partial data is reported as partial. A briefing built on four of
        // seven sections is still useful; a briefing that pretends it had
        // seven is not.
        health: failedSections.length === 0 ? "ok" : "degraded",
        note:
          failedSections.length > 0
            ? `Sebagian data tidak terbaca: ${failedSections.join(", ")}. Angka di bagian tersebut tidak tersedia — jangan dianggap nol.`
            : null,
        metrics: this.toMetrics(snapshot),
        narrative: renderSnapshotForPrompt(snapshot),
      };
    } catch (err) {
      return {
        ...base,
        health: "unreachable",
        metrics: [],
        narrative: null,
        note: `Gagal membaca data MKH System: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private toMetrics(snapshot: Awaited<ReturnType<typeof captureSignalSnapshot>>): NormalizedMetric[] {
    const crm = snapshot.crm.data;
    const ads = snapshot.ads.data;
    const finance = snapshot.finance.data;
    const hr = snapshot.hr.data;
    const markom = snapshot.markom.data;
    const occupancy = snapshot.occupancy.data;
    const derived = snapshot.derived;

    const metrics: NormalizedMetric[] = [];

    if (crm) {
      metrics.push(
        metric(HOLDING_METRIC_KEYS.NEW_LEADS, "Lead baru", crm.newLeads7d, "count", {
          previousValue: crm.newLeadsPrev7d,
          period: "7 hari terakhir",
          direction: "higher_better",
        }),
        metric(HOLDING_METRIC_KEYS.CONVERSIONS, "Closing", crm.closings30d, "count", {
          previousValue: crm.closingsPrev30d,
          period: "30 hari terakhir",
          direction: "higher_better",
        }),
        metric(HOLDING_METRIC_KEYS.PIPELINE_NEGLECT, "Porsi prospek mangkrak", derived.stalledSharePct, "percent", {
          period: "saat ini",
          direction: "lower_better",
        }),
      );
    }

    if (ads) {
      metrics.push(
        metric(HOLDING_METRIC_KEYS.MARKETING_SPEND, "Belanja iklan aktif", ads.totalSpendIdr, "idr", {
          period: "campaign aktif",
          direction: "lower_better",
        }),
        metric(HOLDING_METRIC_KEYS.COST_PER_LEAD, "Biaya per lead", derived.spendPerLeadIdr, "idr", {
          period: "7 hari terakhir",
          direction: "lower_better",
        }),
      );
    }

    if (finance) {
      // Group-level cash is the sum across branches, carrying the age of the
      // OLDEST branch row rather than an average -- a total is only as
      // trustworthy as its least fresh component, and averaging the ages would
      // hide exactly the 10-day-stale branch that matters.
      const totalCash = finance.branches.reduce((sum, b) => sum + b.saldoIdr, 0);
      const oldestSyncMs = finance.branches.reduce<number | null>((oldest, b) => {
        const t = new Date(b.syncedAt).getTime();
        return oldest === null || t < oldest ? t : oldest;
      }, null);

      metrics.push(
        metric(HOLDING_METRIC_KEYS.CASH_BALANCE, "Saldo kas gabungan cabang", finance.branches.length > 0 ? totalCash : null, "idr", {
          period: "posisi terakhir tersinkron",
          direction: "higher_better",
          freshnessDays: oldestSyncMs === null ? null : Math.round(((Date.now() - oldestSyncMs) / 86_400_000) * 10) / 10,
        }),
      );
    }

    if (hr) {
      metrics.push(
        metric(HOLDING_METRIC_KEYS.HEADCOUNT_PRESENT, "Tingkat kehadiran", derived.attendanceRatePct, "percent", {
          period: "hari ini",
          direction: "higher_better",
        }),
      );
    }

    if (markom) {
      metrics.push(
        metric(HOLDING_METRIC_KEYS.OPEN_TASKS_OVERDUE, "Tugas lewat tenggat", markom.overdueTasks, "count", {
          period: "saat ini",
          direction: "lower_better",
        }),
      );
    }

    if (occupancy && occupancy.totalRooms > 0) {
      metrics.push(
        metric(HOLDING_METRIC_KEYS.UTILIZATION, "Okupansi properti", occupancy.occupancyRate, "percent", {
          period: "saat ini",
          direction: "higher_better",
        }),
      );
    }

    return metrics;
  }

  async healthCheck(): Promise<ConnectorStatus> {
    try {
      const snapshot = await captureSignalSnapshot();
      const failed = [snapshot.crm, snapshot.ads, snapshot.finance, snapshot.hr, snapshot.markom, snapshot.occupancy, snapshot.automation].filter(
        (s) => s.error !== null,
      ).length;
      return { reachable: true, detail: failed === 0 ? "Seluruh sumber data terbaca" : `${failed} sumber data gagal dibaca` };
    } catch (err) {
      return { reachable: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Deliberately empty. MKH System's automations are already reachable through
   * FRIDAY's own action catalog (action-catalog.ts) with its approval flow and
   * its check constraint. Exposing them a second time through the connector
   * would create a path to the same automations that bypasses that approval,
   * which is the one thing this architecture must not allow.
   */
  async listAutomations(): Promise<ConnectorAutomation[]> {
    return [];
  }

  async runAutomation(key: string): Promise<string> {
    throw new Error(
      `Automation "${key}" tidak dijalankan lewat connector. Automation MKH System berjalan melalui katalog aksi FRIDAY yang punya alur persetujuan manusia.`,
    );
  }
}
