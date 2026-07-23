"use client";

import ExcelJS from "exceljs";

export interface ExcelColumn<T> {
  header: string;
  key: string;
  width?: number;
  value: (row: T) => string | number | null;
}

/** Builds an .xlsx client-side from already-fetched rows and triggers a download. Client-only (uses the DOM to trigger the download). */
export async function exportRowsToExcel<T>(rows: T[], columns: ExcelColumn<T>[], sheetName: string, filename: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 22 }));

  for (const row of rows) {
    const record: Record<string, string | number | null> = {};
    for (const c of columns) record[c.key] = c.value(row);
    sheet.addRow(record);
  }
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
