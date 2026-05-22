import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const warnings = [];
const isVercelBuild = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

function readText(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    errors.push(`Missing or unreadable ${relativePath}: ${err.message}`);
    return "";
  }
}

function readJson(relativePath) {
  const text = readText(relativePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    errors.push(`Invalid JSON in ${relativePath}: ${err.message}`);
    return null;
  }
}

function assertContains(relativePath, text, expected) {
  if (!text.includes(expected)) {
    errors.push(`${relativePath} must contain ${expected}`);
  }
}

function assertNotContains(relativePath, text, patterns) {
  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      errors.push(`${relativePath} contains wrong-project marker: ${pattern.label}`);
    }
  }
}

const packageJson = readJson("package.json");
const appText = readText("src/App.jsx");
const mainText = readText("src/main.jsx");
const htmlText = readText("index.html");
const viteText = readText("vite.config.js");
const cssText = readText("src/index.css");
const envExampleText = fs.existsSync(path.join(root, ".env.example")) ? readText(".env.example") : "";
const employeeClockText = readText("src/EmployeeClockApp.jsx");
const vercelProject = fs.existsSync(path.join(root, ".vercel/project.json"))
  ? readJson(".vercel/project.json")
  : null;

const wrongProjectMarkers = [
  { label: "AuraCut", regex: /AuraCut/i },
  { label: "AURACUT", regex: /AURACUT/i },
  { label: "Bridge App", regex: /Bridge App/i },
  { label: "SdosPage", regex: /SdosPage/i },
  { label: "bridgeDb", regex: /bridgeDb/i },
  { label: "video_projects", regex: /video_projects/i },
  { label: "ChatGPT bridge UI", regex: /CHATGPT INPUT|CHATGPT OUTPUT|Ask SDOS/i },
];

assertContains("src/App.jsx", appText, "EmployeeClockApp");
assertContains("src/EmployeeClockApp.jsx", employeeClockText, "OPERA.AI");
assertContains("index.html", htmlText, "OPERA.AI");
assertContains("vite.config.js", viteText, "OPERA.AI");
assertContains("src/main.jsx", mainText, "./App.jsx");

for (const [relativePath, text] of [
  ["src/App.jsx", appText],
  ["src/main.jsx", mainText],
  ["src/index.css", cssText],
  ["index.html", htmlText],
  ["vite.config.js", viteText],
  [".env.example", envExampleText],
  ["package.json", JSON.stringify(packageJson || {}, null, 2)],
]) {
  assertNotContains(relativePath, text, wrongProjectMarkers);
}

if (!isVercelBuild && vercelProject?.projectName !== "project-rui1d") {
  errors.push(`.vercel/project.json must point to project-rui1d, found ${vercelProject?.projectName || "unknown"}`);
}

const scripts = packageJson?.scripts || {};
for (const [name, command] of Object.entries(scripts)) {
  if (/auracut|bridge|sdos|render-worker|video_projects/i.test(`${name} ${command}`)) {
    errors.push(`package.json script "${name}" looks like another project: ${command}`);
  }
}

const suspiciousPaths = [
  "src/components/SdosPage.jsx",
  "src/lib/bridgeDb.js",
  "docs/AURACUT_TAKEOVER_STATUS.md",
  "docs/AURACUT_DEPLOY_RESULT.md",
];
for (const relativePath of suspiciousPaths) {
  if (fs.existsSync(path.join(root, relativePath))) {
    warnings.push(`${relativePath} exists. It is not part of OPERA.AI runtime; remove it after backing up if it belongs to another app.`);
  }
}

if (errors.length) {
  console.error("\nOPERA workspace verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length) {
    console.error("\nWarnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  console.error("\nBuild/deploy stopped to protect OPERA.AI.");
  process.exit(1);
}

console.log("OPERA workspace verification passed.");
if (warnings.length) {
  console.warn("Warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}
