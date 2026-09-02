import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "D:/Descargas/Análisis Rentabilidad Sucursales - respaldo.xlsx";
const outputDir = "D:/Proyectos/Opervia/.analysis/excel-reconcile/output";
await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const summary = await workbook.inspect({
  kind: "workbook,sheet,definedName,drawing",
  include: "id,name,range,formula,type",
  maxChars: 30000,
  options: { maxResults: 500 },
});
await fs.writeFile(path.join(outputDir, "workbook_summary.ndjson"), summary.ndjson, "utf8");

const sheets = workbook.worksheets.items.map((sheet) => ({
  id: sheet.id,
  name: sheet.name,
  usedRange: sheet.getUsedRange()?.address ?? null,
}));
await fs.writeFile(path.join(outputDir, "sheets.json"), JSON.stringify(sheets, null, 2), "utf8");
console.log(JSON.stringify(sheets, null, 2));
