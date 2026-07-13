import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "src/App.jsx",
  "src/orpl/OrplPortalApp.jsx",
  "api/orpl/customers.js",
  "supabase/migrations/20260707120000_create_orpl_customer_portal.sql",
];

const errors = [];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

const appText = fs.existsSync(path.join(root, "src/App.jsx"))
  ? fs.readFileSync(path.join(root, "src/App.jsx"), "utf8")
  : "";
const htmlText = fs.existsSync(path.join(root, "index.html"))
  ? fs.readFileSync(path.join(root, "index.html"), "utf8")
  : "";

if (!appText.includes("OrplPortalApp")) {
  errors.push("src/App.jsx must boot OrplPortalApp.");
}

if (!htmlText.includes("ORPL Customer Portal")) {
  errors.push("index.html must include the ORPL Customer Portal title.");
}

if (errors.length > 0) {
  console.error("ORPL workspace verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("ORPL workspace verification passed.");
