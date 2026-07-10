import assert from "node:assert/strict";
import { normalizeReceiptJson } from "../api-handlers/ai-field-docs.js";

const homeDepot = normalizeReceiptJson({
  store: "Home Depot",
  date: "2026-06-14",
  subtotal: "$42.00",
  tax: "5.46",
  total: "$47.46 CAD",
  currency: "",
  likely_category: "tools",
  material: "drill bits",
  confidence: "0.91",
});

assert.equal(homeDepot.supplier, "Home Depot");
assert.equal(homeDepot.receipt_date, "2026-06-14");
assert.equal(homeDepot.subtotal, 42);
assert.equal(homeDepot.hst, 5.46);
assert.equal(homeDepot.total_amount, 47.46);
assert.equal(homeDepot.currency, "CAD");
assert.equal(homeDepot.material_category, "tools");
assert.equal(homeDepot.material_type, "drill bits");
assert.equal(homeDepot.confidence, 0.91);

const sparse = normalizeReceiptJson({
  vendor: "",
  receipt_total: "",
  receipt_hst: null,
});

assert.equal(sparse.supplier, null);
assert.equal(sparse.total_amount, null);
assert.equal(sparse.hst, null);
assert.equal(sparse.currency, "CAD");
assert.equal(sparse.material_category, "other");

console.log("Receipt OCR normalization tests passed.");
