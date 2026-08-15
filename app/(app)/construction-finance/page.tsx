import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { History, PackageSearch, Wallet } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/constants/rbac";
import { CmCostControlCard } from "@/features/construction-finance/components/cm-cost-control-card";
import { CmLaborContractsCard } from "@/features/construction-finance/components/cm-labor-contracts-card";
import { CmMaterialRequirementCard } from "@/features/construction-finance/components/cm-material-requirement-card";
import { CmWbsProgressCard } from "@/features/construction-finance/components/cm-wbs-progress-card";
import { ConstructionExpenseForm } from "@/features/construction-finance/components/construction-expense-form";
import { ConstructionSettleUtangButton } from "@/features/construction-finance/components/construction-settle-utang-button";
import { CreateConstructionProjectDialog } from "@/features/construction-finance/components/create-construction-project-dialog";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { listBranches } from "@/repositories/branch.repository";
import { getProjectCostControl, type ProjectCostControl } from "@/repositories/cm-cost-control.repository";
import { listActiveContractors, listPendingLaborPayments, listProjectLaborContracts, listProjectWbsOptions } from "@/repositories/cm-labor.repository";
import { listActiveMaterials, listMaterialStock } from "@/repositories/cm-material.repository";
import { listMaterialRequirement, listPendingPurchaseRequests } from "@/repositories/cm-procurement.repository";
import { getProjectOverallProgress, listPendingWbsProgressLogs, listProjectWbs } from "@/repositories/cm-wbs.repository";
import {
  getActiveConstructionProject,
  listActiveConstructionProjects,
  listConstructionExpenses,
  listUnsettledUtang,
  type ConstructionExpense,
  type ConstructionProject,
} from "@/repositories/construction-finance.repository";

export const metadata: Metadata = { title: "Keuangan Proyek" };

const EXPENSE_TYPE_LABEL: Record<ConstructionExpense["expenseType"], string> = {
  gaji_tukang: "Gaji Tukang",
  material_tunai: "Material (Tunai)",
  pembelian_material: "Material (Utang)",
  lain_lain_tunai: "Lain-lain (Tunai)",
  pembelian_lain_lain: "Lain-lain (Utang)",
};

function SummaryCard({ project }: { project: ConstructionProject }) {
  const sisaDana = project.danaMasuk - project.totalCashOut;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          {project.name}
          {project.branchName ? ` — ${project.branchName}` : ""}
        </CardTitle>
        <CardDescription>Ringkasan dana proyek.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Anggaran</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(project.totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Dana Sudah Ditransfer</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(project.danaMasuk)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sisa Dana Tunai</p>
            <p className="text-lg font-semibold tabular-nums">{formatCurrency(sisaDana)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Utang Toko Belum Lunas</p>
            <p className="text-lg font-semibold tabular-nums text-destructive">{formatCurrency(project.totalUtangBelumLunas)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ConstructionFinancePage() {
  const session = await requireSession();
  const canSubmit = hasPermission(session, PERMISSIONS.CONSTRUCTION_FINANCE_SUBMIT);
  const canManage = hasPermission(session, PERMISSIONS.CONSTRUCTION_FINANCE_MANAGE);

  if (!canSubmit && !canManage) redirect("/dashboard?error=forbidden");

  const supabase = await createClient();

  const projects = canManage
    ? await listActiveConstructionProjects(supabase)
    : session.employee.branch_id
      ? [await getActiveConstructionProject(supabase, session.employee.branch_id)].filter((p): p is ConstructionProject => p !== null)
      : [];

  const ownProject = projects.find((p) => p.branchId === session.employee.branch_id) ?? projects[0] ?? null;

  const [
    expenses,
    unsettledUtang,
    materials,
    materialStock,
    wbsItems,
    overallProgress,
    pendingWbsLogs,
    materialRequirement,
    pendingPr,
    laborContracts,
    contractors,
    wbsOptions,
    pendingLaborPayments,
    costControl,
    allProjectsCostControl,
    branches,
  ] = await Promise.all([
    ownProject ? listConstructionExpenses(supabase, ownProject.id) : Promise.resolve([]),
    canManage ? listUnsettledUtang(supabase) : Promise.resolve([]),
    canSubmit ? listActiveMaterials(supabase) : Promise.resolve([]),
    ownProject ? listMaterialStock(supabase, ownProject.id) : Promise.resolve([]),
    ownProject ? listProjectWbs(supabase, ownProject.id) : Promise.resolve([]),
    ownProject ? getProjectOverallProgress(supabase, ownProject.id) : Promise.resolve(0),
    canManage ? listPendingWbsProgressLogs(supabase) : Promise.resolve([]),
    ownProject ? listMaterialRequirement(supabase, ownProject.id) : Promise.resolve([]),
    canManage ? listPendingPurchaseRequests(supabase) : Promise.resolve([]),
    ownProject && canManage ? listProjectLaborContracts(supabase, ownProject.id) : Promise.resolve([]),
    canManage ? listActiveContractors(supabase) : Promise.resolve([]),
    ownProject ? listProjectWbsOptions(supabase, ownProject.id) : Promise.resolve([]),
    canManage ? listPendingLaborPayments(supabase) : Promise.resolve([]),
    ownProject ? getProjectCostControl(supabase, ownProject.id) : Promise.resolve(null),
    canManage && projects.length > 1
      ? Promise.all(projects.map(async (p) => ({ project: p, cost: await getProjectCostControl(supabase, p.id) })))
      : Promise.resolve([]),
    canManage ? listBranches(supabase, false) : Promise.resolve([]),
  ]);

  const branchesWithoutProject = branches.filter((b) => !projects.some((p) => p.branchId === b.id)).map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Keuangan Proyek"
        description="Input gaji tukang, pembelian material, dan kelola pembangunan untuk proyek cabang mana pun -- tidak dibatasi satu cabang."
      />

      {canManage && branchesWithoutProject.length > 0 && (
        <div className="flex justify-end">
          <CreateConstructionProjectDialog branches={branchesWithoutProject} />
        </div>
      )}

      {projects.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="Belum ada proyek aktif"
          description={
            canManage
              ? "Belum ada proyek pembangunan. Buat proyek baru untuk cabang yang membutuhkan."
              : "Belum ada dana proyek pembangunan yang dialokasikan untuk cabang Anda."
          }
        />
      )}

      {projects.map((project) => (
        <SummaryCard key={project.id} project={project} />
      ))}

      {allProjectsCostControl.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perbandingan Antar Cabang</CardTitle>
            <CardDescription>Progress vs realisasi biaya, semua proyek pembangunan aktif.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Proyek</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead className="text-right">Realisasi Biaya</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allProjectsCostControl.map(({ project, cost }: { project: ConstructionProject; cost: ProjectCostControl | null }) => (
                    <TableRow key={project.id}>
                      <TableCell>{project.branchName ?? "-"}</TableCell>
                      <TableCell>{project.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{cost?.progressPct ?? 0}%</TableCell>
                      <TableCell className="text-right tabular-nums">{cost?.costPct ?? "-"}%</TableCell>
                      <TableCell>
                        {cost?.status === "cost_ahead" && <Badge variant="destructive">Biaya Lebih Cepat</Badge>}
                        {cost?.status === "good" && <Badge>Progress Lebih Cepat</Badge>}
                        {cost?.status === "balanced" && <Badge variant="secondary">Seimbang</Badge>}
                        {(!cost || cost.status === "unknown") && <Badge variant="outline">-</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {costControl && <CmCostControlCard cost={costControl} />}

      {ownProject && wbsItems.length > 0 && (
        <CmWbsProgressCard
          overallProgress={overallProgress}
          items={wbsItems}
          pendingLogs={pendingWbsLogs}
          canSubmit={canSubmit}
          canApprove={canManage}
        />
      )}

      {ownProject && materialRequirement.length > 0 && (
        <CmMaterialRequirementCard
          projectId={ownProject.id}
          requirement={materialRequirement}
          pendingPr={pendingPr}
          materials={materials}
          canSubmit={canSubmit}
          canApprove={canManage}
        />
      )}

      {ownProject && canManage && (
        <CmLaborContractsCard
          projectId={ownProject.id}
          contracts={laborContracts}
          contractors={contractors}
          wbsOptions={wbsOptions}
          pendingPayments={pendingLaborPayments}
          canManage={canManage}
        />
      )}

      {canSubmit && ownProject && <ConstructionExpenseForm projectId={ownProject.id} materials={materials} />}

      {ownProject && materialStock.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageSearch className="h-4 w-4" />
              Stok Material
            </CardTitle>
            <CardDescription>Otomatis bertambah setiap kali pembelian material diinput dengan material + jumlah dipilih.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialStock.map((row) => (
                    <TableRow key={row.materialId}>
                      <TableCell>{row.materialName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.quantity} {row.unitSatuan}
                        {row.quantity < row.minStock && (
                          <Badge variant="destructive" className="ml-2">
                            Rendah
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {canManage && unsettledUtang.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utang Toko Belum Lunas (Semua Cabang)</CardTitle>
            <CardDescription>Tandai lunas setelah invoice toko dibayar.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Toko</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unsettledUtang.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.branchName ?? "-"}</TableCell>
                      <TableCell>{item.partyName}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.expenseDate}</TableCell>
                      <TableCell>
                        <ConstructionSettleUtangButton id={item.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Riwayat Input
          </CardTitle>
          <CardDescription>Daftar gaji tukang dan pembelian material yang pernah diinput.</CardDescription>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <EmptyState icon={History} title="Belum ada riwayat" description="Belum ada input gaji tukang atau pembelian material." className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{EXPENSE_TYPE_LABEL[item.expenseType]}</TableCell>
                      <TableCell>{item.partyName}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.expenseDate}</TableCell>
                      <TableCell>
                        {item.paymentMethod === "cash" ? (
                          <Badge variant="outline">Tunai</Badge>
                        ) : (
                          <Badge variant={item.isSettled ? "default" : "destructive"}>{item.isSettled ? "Utang Lunas" : "Utang Belum Lunas"}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
