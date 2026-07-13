import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/samra/clock-app/outputs/renovation-selections-tracker";
const outputPath = path.join(outputDir, "renovation-selections-tracker.xlsx");
const TODO = "\u2610";
const DONE = "\u2611";

const rows = [
  ["Bathroom", "Bathroom Floor Tile"],
  ["Bathroom", "Shower Wall Tile"],
  ["Bathroom", "Shower Niche Tile"],
  ["Bathroom", "Shower Glass"],
  ["Bathroom", "Shower Base"],
  ["Bathroom", "Shower Faucet & Trim Kit"],
  ["Bathroom", "Shower Head"],
  ["Bathroom", "Hand Shower"],
  ["Bathroom", "Shower Drain"],
  ["Bathroom", "Vanity"],
  ["Bathroom", "Vanity Countertop"],
  ["Bathroom", "Bathroom Sink"],
  ["Bathroom", "Bathroom Faucet"],
  ["Bathroom", "Mirror"],
  ["Bathroom", "Vanity Light"],
  ["Bathroom", "Toilet"],
  ["Bathroom", "Exhaust Fan"],
  ["Bathroom", "Towel Bar"],
  ["Bathroom", "Toilet Paper Holder"],
  ["Bathroom", "Robe Hook"],
  ["Bathroom", "Bathroom Accessories"],
  ["Kitchen", "Kitchen Cabinets"],
  ["Kitchen", "Cabinet Colour"],
  ["Kitchen", "Cabinet Hardware"],
  ["Kitchen", "Cabinet Handles"],
  ["Kitchen", "Countertop"],
  ["Kitchen", "Backsplash"],
  ["Kitchen", "Kitchen Sink"],
  ["Kitchen", "Kitchen Faucet"],
  ["Kitchen", "Under-Cabinet Lighting"],
  ["Flooring", "Main Flooring"],
  ["Flooring", "Stair Flooring"],
  ["Flooring", "Stair Nosing"],
  ["Flooring", "Floor Transitions"],
  ["Paint", "Wall Colour"],
  ["Paint", "Ceiling Colour"],
  ["Paint", "Trim Colour"],
  ["Paint", "Door Colour"],
  ["Doors & Trim", "Interior Doors"],
  ["Doors & Trim", "Closet Doors"],
  ["Doors & Trim", "Door Handles"],
  ["Doors & Trim", "Hinges"],
  ["Doors & Trim", "Baseboards"],
  ["Doors & Trim", "Baseboard Size"],
  ["Doors & Trim", "Door Casings"],
  ["Doors & Trim", "Window Casings"],
  ["Doors & Trim", "Trim Design/Profile"],
  ["Doors & Trim", "Door Stops"],
  ["Windows & Exterior", "Windows"],
  ["Windows & Exterior", "Window Trim"],
  ["Windows & Exterior", "Exterior Door"],
  ["Windows & Exterior", "Exterior Door Hardware"],
  ["Windows & Exterior", "Doorbell"],
  ["Final Finishes", "Grout Colour"],
  ["Final Finishes", "Silicone/Caulking Colour"],
  ["Final Finishes", "Shelving"],
  ["Final Finishes", "Closet Organizer"],
  ["Final Finishes", "Window Coverings"],
];

const workbook = Workbook.create();
const tracker = workbook.worksheets.add("Selections Tracker");
const dashboard = workbook.worksheets.add("Dashboard");
const lists = workbook.worksheets.add("Lists");

const headerFill = "#435247";
const headerText = "#FFFFFF";
const accent = "#EAF3EE";
const border = "#D8E0DC";
const totalRows = rows.length;
const tableStart = 7;
const dataStart = tableStart + 1;
const dataEnd = dataStart + totalRows - 1;
const tableEnd = dataEnd;
const categories = [...new Set(rows.map(([category]) => category))];

tracker.showGridLines = false;
dashboard.showGridLines = false;
lists.showGridLines = false;

tracker.getRange("A1:P1").merge();
tracker.getRange("A1").values = [["Renovation Selections Tracker"]];
tracker.getRange("A1").format = {
  fill: "#F4F7F5",
  font: { bold: true, size: 18, color: "#243129" },
};
tracker.getRange("A1").format.rowHeightPx = 34;

tracker.getRange("A2:P2").merge();
tracker.getRange("A2").values = [["Track selections, owners, deadlines, suppliers, ordering, delivery, installation, and budget."]];
tracker.getRange("A2").format = {
  fill: "#F4F7F5",
  font: { italic: true, color: "#5A665F" },
};
tracker.getRange("A2").format.rowHeightPx = 24;

tracker.getRange("A4:P5").format = {
  fill: "#FFFFFF",
  borders: { preset: "outside", style: "thin", color: border },
};
for (const pair of ["A:B", "C:D", "E:F", "G:H", "I:J", "K:L", "M:N", "O:P"]) {
  tracker.getRange(`${pair.split(":")[0]}4:${pair.split(":")[1]}4`).merge();
  tracker.getRange(`${pair.split(":")[0]}5:${pair.split(":")[1]}5`).merge();
}

tracker.getRange("A4:P4").values = [[
  "Total Items", null,
  "Not Selected", null,
  "Due Soon", null,
  "Overdue", null,
  "Ordered Not Delivered", null,
  "Installed", null,
  "Estimated Total", null,
  "Open Items", null,
]];
tracker.getRange("A5:P5").formulas = [[
  `=COUNTA(C${dataStart}:C${dataEnd})`, null,
  `=COUNTBLANK(G${dataStart}:G${dataEnd})`, null,
  `=COUNTIFS(F${dataStart}:F${dataEnd},">="&TODAY(),F${dataStart}:F${dataEnd},"<="&TODAY()+7,A${dataStart}:A${dataEnd},"${TODO}")`, null,
  `=COUNTIFS(F${dataStart}:F${dataEnd},"<"&TODAY(),F${dataStart}:F${dataEnd},"<>",A${dataStart}:A${dataEnd},"${TODO}")`, null,
  `=COUNTIFS(L${dataStart}:L${dataEnd},"Yes",M${dataStart}:M${dataEnd},"<>Yes")`, null,
  `=COUNTIF(N${dataStart}:N${dataEnd},"Yes")`, null,
  `=SUM(K${dataStart}:K${dataEnd})`, null,
  `=COUNTIF(A${dataStart}:A${dataEnd},"${TODO}")`, null,
]];
tracker.getRange("A4:P4").format = {
  fill: accent,
  font: { bold: true, color: "#2F3A33" },
};
tracker.getRange("A5:P5").format = {
  fill: "#FFFFFF",
  font: { bold: true, color: "#16251B", size: 12 },
};
tracker.getRange("M5:N5").format.numberFormat = "$#,##0";

const headers = [
  "Done",
  "Category",
  "Item",
  "Priority",
  "Owner / Next Action",
  "Decision Due",
  "Selected Product",
  "Product Link / Model",
  "Supplier Name",
  "Supplier Contact",
  "Price (CAD)",
  "Ordered",
  "Delivered",
  "Installed",
  "Lead Time",
  "Notes",
];
tracker.getRange(`A${tableStart}:P${tableStart}`).values = [headers];
tracker.getRange(`A${tableStart}:P${tableStart}`).format = {
  fill: headerFill,
  font: { bold: true, color: headerText },
  borders: { preset: "outside", style: "thin", color: "#2B352E" },
};
tracker.getRange(`A${tableStart}:P${tableStart}`).format.rowHeightPx = 28;

const tableValues = rows.map(([category, item]) => [
  TODO,
  category,
  item,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  "No",
  "No",
  "No",
  null,
  null,
]);
tracker.getRange(`A${dataStart}:P${dataEnd}`).values = tableValues;
tracker.getRange(`A${dataStart}:P${dataEnd}`).format = {
  fill: "#FFFFFF",
  font: { color: "#243129" },
  borders: {
    insideHorizontal: { style: "thin", color: "#EEF2F0" },
    insideVertical: { style: "thin", color: "#EEF2F0" },
    bottom: { style: "thin", color: border },
  },
};
tracker.getRange(`A${dataStart}:A${dataEnd}`).format = { font: { size: 13, color: "#435247" } };
tracker.getRange(`F${dataStart}:F${dataEnd}`).format.numberFormat = "yyyy-mm-dd";
tracker.getRange(`K${dataStart}:K${dataEnd}`).format.numberFormat = "$#,##0";
tracker.getRange(`A${dataStart}:P${dataEnd}`).format.wrapText = true;

tracker.getRange("A:A").format.columnWidthPx = 62;
tracker.getRange("B:B").format.columnWidthPx = 150;
tracker.getRange("C:C").format.columnWidthPx = 220;
tracker.getRange("D:D").format.columnWidthPx = 95;
tracker.getRange("E:E").format.columnWidthPx = 150;
tracker.getRange("F:F").format.columnWidthPx = 112;
tracker.getRange("G:G").format.columnWidthPx = 220;
tracker.getRange("H:H").format.columnWidthPx = 190;
tracker.getRange("I:I").format.columnWidthPx = 170;
tracker.getRange("J:J").format.columnWidthPx = 180;
tracker.getRange("K:K").format.columnWidthPx = 110;
tracker.getRange("L:N").format.columnWidthPx = 95;
tracker.getRange("O:O").format.columnWidthPx = 105;
tracker.getRange("P:P").format.columnWidthPx = 260;
tracker.getRange(`A${dataStart}:P${dataEnd}`).format.rowHeightPx = 30;
tracker.freezePanes.freezeRows(tableStart);
tracker.freezePanes.freezeColumns(3);

const table = tracker.tables.add(`A${tableStart}:P${tableEnd}`, true, "SelectionsTracker");
table.style = "TableStyleMedium4";
table.showFilterButton = true;
table.showBandedColumns = false;
table.showTotals = false;

tracker.getRange(`A${dataStart}:A${dataEnd}`).dataValidation = { rule: { type: "list", values: [TODO, DONE] } };
tracker.getRange(`D${dataStart}:D${dataEnd}`).dataValidation = { rule: { type: "list", values: ["High", "Medium", "Low", "Later"] } };
tracker.getRange(`E${dataStart}:E${dataEnd}`).dataValidation = { rule: { type: "list", values: ["Homeowner", "Contractor", "Designer", "Supplier", "Waiting", "Done"] } };
tracker.getRange(`L${dataStart}:N${dataEnd}`).dataValidation = { rule: { type: "list", values: ["No", "Yes", "N/A"] } };

tracker.getRange(`A${dataStart}:P${dataEnd}`).conditionalFormats.addCustom(`=$A${dataStart}="${DONE}"`, {
  fill: "#EEF7F1",
  font: { color: "#506157" },
});
tracker.getRange(`D${dataStart}:D${dataEnd}`).conditionalFormats.add("containsText", {
  text: "High",
  format: { fill: "#FCE8E6", font: { color: "#A23B32", bold: true } },
});
tracker.getRange(`D${dataStart}:D${dataEnd}`).conditionalFormats.add("containsText", {
  text: "Medium",
  format: { fill: "#FFF4D6", font: { color: "#8A5B00" } },
});
tracker.getRange(`D${dataStart}:D${dataEnd}`).conditionalFormats.add("containsText", {
  text: "Low",
  format: { fill: "#E8F0FE", font: { color: "#1A5DBB" } },
});
tracker.getRange(`L${dataStart}:N${dataEnd}`).conditionalFormats.add("containsText", {
  text: "Yes",
  format: { fill: "#DFF3E5", font: { color: "#137333", bold: true } },
});
tracker.getRange(`L${dataStart}:N${dataEnd}`).conditionalFormats.add("containsText", {
  text: "No",
  format: { fill: "#F2F4F7", font: { color: "#59636E" } },
});
tracker.getRange(`F${dataStart}:F${dataEnd}`).conditionalFormats.addCustom(`=AND($F${dataStart}<TODAY(),$F${dataStart}<>"",$A${dataStart}="${TODO}")`, {
  fill: "#FCE8E6",
  font: { color: "#A23B32", bold: true },
});
tracker.getRange(`F${dataStart}:F${dataEnd}`).conditionalFormats.addCustom(`=AND($F${dataStart}>=TODAY(),$F${dataStart}<=TODAY()+7,$A${dataStart}="${TODO}")`, {
  fill: "#FFF4D6",
  font: { color: "#8A5B00", bold: true },
});
tracker.getRange(`I${dataStart}:J${dataEnd}`).conditionalFormats.addCustom(`=AND($L${dataStart}="Yes",$I${dataStart}="")`, {
  fill: "#FCE8E6",
  font: { color: "#A23B32" },
});
tracker.getRange(`K${dataStart}:K${dataEnd}`).conditionalFormats.addCustom(`=AND($G${dataStart}<>"",$K${dataStart}="")`, {
  fill: "#FFF4D6",
  font: { color: "#8A5B00" },
});
tracker.getRange(`M${dataStart}:M${dataEnd}`).conditionalFormats.addCustom(`=AND($M${dataStart}="Yes",$L${dataStart}<>"Yes")`, {
  fill: "#FCE8E6",
  font: { color: "#A23B32", bold: true },
});
tracker.getRange(`N${dataStart}:N${dataEnd}`).conditionalFormats.addCustom(`=AND($N${dataStart}="Yes",$M${dataStart}<>"Yes")`, {
  fill: "#FCE8E6",
  font: { color: "#A23B32", bold: true },
});

// Dashboard
dashboard.getRange("A1:H1").merge();
dashboard.getRange("A1").values = [["Renovation Selection Dashboard"]];
dashboard.getRange("A1").format = {
  fill: "#F4F7F5",
  font: { bold: true, size: 18, color: "#243129" },
};
dashboard.getRange("A1").format.rowHeightPx = 34;

dashboard.getRange("A3:H6").format = {
  fill: "#FFFFFF",
  borders: { preset: "outside", style: "thin", color: border },
};
for (const pair of ["A:B", "C:D", "E:F", "G:H"]) {
  dashboard.getRange(`${pair.split(":")[0]}3:${pair.split(":")[1]}3`).merge();
  dashboard.getRange(`${pair.split(":")[0]}4:${pair.split(":")[1]}4`).merge();
  dashboard.getRange(`${pair.split(":")[0]}5:${pair.split(":")[1]}5`).merge();
  dashboard.getRange(`${pair.split(":")[0]}6:${pair.split(":")[1]}6`).merge();
}

dashboard.getRange("A3:H3").values = [["Open Items", null, "Not Selected", null, "Due Soon", null, "Overdue", null]];
dashboard.getRange("A4:H4").formulas = [[
  `=COUNTIF('Selections Tracker'!A${dataStart}:A${dataEnd},"${TODO}")`, null,
  `=COUNTBLANK('Selections Tracker'!G${dataStart}:G${dataEnd})`, null,
  `=COUNTIFS('Selections Tracker'!F${dataStart}:F${dataEnd},">="&TODAY(),'Selections Tracker'!F${dataStart}:F${dataEnd},"<="&TODAY()+7,'Selections Tracker'!A${dataStart}:A${dataEnd},"${TODO}")`, null,
  `=COUNTIFS('Selections Tracker'!F${dataStart}:F${dataEnd},"<"&TODAY(),'Selections Tracker'!F${dataStart}:F${dataEnd},"<>",'Selections Tracker'!A${dataStart}:A${dataEnd},"${TODO}")`, null,
]];
dashboard.getRange("A5:H5").values = [["Ordered Not Delivered", null, "Delivered Not Installed", null, "Installed", null, "Estimated Total", null]];
dashboard.getRange("A6:H6").formulas = [[
  `=COUNTIFS('Selections Tracker'!L${dataStart}:L${dataEnd},"Yes",'Selections Tracker'!M${dataStart}:M${dataEnd},"<>Yes")`, null,
  `=COUNTIFS('Selections Tracker'!M${dataStart}:M${dataEnd},"Yes",'Selections Tracker'!N${dataStart}:N${dataEnd},"<>Yes")`, null,
  `=COUNTIF('Selections Tracker'!N${dataStart}:N${dataEnd},"Yes")`, null,
  `=SUM('Selections Tracker'!K${dataStart}:K${dataEnd})`, null,
]];
dashboard.getRange("A3:H3").format = { fill: accent, font: { bold: true, color: "#2F3A33" } };
dashboard.getRange("A5:H5").format = { fill: accent, font: { bold: true, color: "#2F3A33" } };
dashboard.getRange("A4:H4").format = { fill: "#FFFFFF", font: { bold: true, size: 13, color: "#16251B" } };
dashboard.getRange("A6:H6").format = { fill: "#FFFFFF", font: { bold: true, size: 13, color: "#16251B" } };
dashboard.getRange("G6:H6").format.numberFormat = "$#,##0";

dashboard.getRange("A9:D9").values = [["Category", "Total", "Done", "Remaining"]];
dashboard.getRange("A9:D9").format = { fill: headerFill, font: { bold: true, color: headerText } };
dashboard.getRange(`A10:A${9 + categories.length}`).values = categories.map((category) => [category]);
dashboard.getRange(`B10:D${9 + categories.length}`).formulas = categories.map((category, idx) => {
  const row = 10 + idx;
  return [
    `=COUNTIF('Selections Tracker'!B${dataStart}:B${dataEnd},A${row})`,
    `=COUNTIFS('Selections Tracker'!B${dataStart}:B${dataEnd},A${row},'Selections Tracker'!A${dataStart}:A${dataEnd},"${DONE}")`,
    `=B${row}-C${row}`,
  ];
});
dashboard.getRange(`A10:D${9 + categories.length}`).format = {
  fill: "#FFFFFF",
  borders: {
    insideHorizontal: { style: "thin", color: "#EEF2F0" },
    bottom: { style: "thin", color: border },
  },
};
dashboard.getRange("A:A").format.columnWidthPx = 190;
dashboard.getRange("B:D").format.columnWidthPx = 96;
dashboard.getRange("E:H").format.columnWidthPx = 120;

dashboard.getRange("J27:K27").values = [["Category", "Remaining"]];
dashboard.getRange(`J28:K${27 + categories.length}`).formulas = categories.map((category, idx) => [
  `=A${10 + idx}`,
  `=D${10 + idx}`,
]);
const chart = dashboard.charts.add("bar", dashboard.getRange(`J27:K${27 + categories.length}`));
chart.title = "Remaining Items by Category";
chart.hasLegend = false;
chart.xAxis = { axisType: "textAxis" };
chart.setPosition("F9", "M24");

// Lists and helper values
lists.getRange("A1:E1").values = [["Completion", "Priority", "Step Values", "Categories", "Owners"]];
lists.getRange("A1:E1").format = { fill: headerFill, font: { bold: true, color: headerText } };
lists.getRange("A2:A3").values = [[TODO], [DONE]];
lists.getRange("B2:B5").values = [["High"], ["Medium"], ["Low"], ["Later"]];
lists.getRange("C2:C4").values = [["No"], ["Yes"], ["N/A"]];
lists.getRange(`D2:D${categories.length + 1}`).values = categories.map((category) => [category]);
lists.getRange("E2:E7").values = [["Homeowner"], ["Contractor"], ["Designer"], ["Supplier"], ["Waiting"], ["Done"]];
lists.getRange("A:E").format.columnWidthPx = 150;
lists.getRange("A1:E20").format.borders = { preset: "inside", style: "thin", color: "#EEF2F0" };

for (const sheet of [tracker, dashboard, lists]) {
  const used = sheet.getUsedRange();
  used.format.font.name = "Arial";
  used.format.verticalAlignment = "middle";
}

await fs.mkdir(outputDir, { recursive: true });

const inspect = await workbook.inspect({
  kind: "table",
  range: `Selections Tracker!A${tableStart}:P${Math.min(tableEnd, tableStart + 8)}`,
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 16,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const trackerPreview = await workbook.render({
  sheetName: "Selections Tracker",
  range: "A1:P24",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "tracker-preview.png"),
  new Uint8Array(await trackerPreview.arrayBuffer()),
);

const dashboardPreview = await workbook.render({
  sheetName: "Dashboard",
  range: "A1:M24",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "dashboard-preview.png"),
  new Uint8Array(await dashboardPreview.arrayBuffer()),
);

const listsPreview = await workbook.render({
  sheetName: "Lists",
  range: "A1:E12",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "lists-preview.png"),
  new Uint8Array(await listsPreview.arrayBuffer()),
);

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);
console.log(`Saved ${outputPath}`);
process.exitCode = 0;
