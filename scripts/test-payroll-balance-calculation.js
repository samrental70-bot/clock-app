import assert from "node:assert/strict";
import {
  applyRunningPayrollBalances,
  computePayrollPeriodBalance,
} from "../src/lib/payrollBalance.js";

function money(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function verifyCase(label, input, expectedBalance) {
  const result = computePayrollPeriodBalance(input);
  assert.equal(
    money(result.balance),
    money(expectedBalance),
    `${label} expected ${expectedBalance}, received ${result.balance}`
  );
  return money(result.balance);
}

const caseResults = {
  fullyPaid: verifyCase(
    "fully paid",
    {
      previousBalance: 0,
      workedAmount: 1000,
      paidAmount: 1000,
      loanGivenAmount: 0,
      loanReturnedAmount: 0,
    },
    0
  ),
  underPaid: verifyCase(
    "underpaid",
    {
      previousBalance: 0,
      workedAmount: 1000,
      paidAmount: 800,
      loanGivenAmount: 0,
      loanReturnedAmount: 0,
    },
    200
  ),
  overPaid: verifyCase(
    "overpaid",
    {
      previousBalance: 0,
      workedAmount: 1000,
      paidAmount: 1200,
      loanGivenAmount: 0,
      loanReturnedAmount: 0,
    },
    -200
  ),
  loanGiven: verifyCase(
    "loan given",
    {
      previousBalance: 0,
      workedAmount: 1000,
      paidAmount: 800,
      loanGivenAmount: 300,
      loanReturnedAmount: 0,
    },
    -100
  ),
  loanReturned: verifyCase(
    "loan returned",
    {
      previousBalance: 0,
      workedAmount: 1000,
      paidAmount: 800,
      loanGivenAmount: 300,
      loanReturnedAmount: 100,
    },
    0
  ),
  previousBalance: verifyCase(
    "previous balance",
    {
      previousBalance: 500,
      workedAmount: 1000,
      paidAmount: 800,
      loanGivenAmount: 300,
      loanReturnedAmount: 100,
    },
    500
  ),
};

const runningPeriods = applyRunningPayrollBalances(
  [
    {
      periodStart: "2026-06-01",
      periodEnd: "2026-06-14",
      workedAmount: 1000,
      paidAmount: 800,
      loanGivenAmount: 300,
      loanReturnedAmount: 100,
    },
    {
      periodStart: "2026-06-15",
      periodEnd: "2026-06-28",
      workedAmount: 250,
      paidAmount: 100,
      loanGivenAmount: 0,
      loanReturnedAmount: 50,
    },
  ],
  500
);

assert.equal(money(runningPeriods[0].previousBalance), 500, "first period should inherit opening balance");
assert.equal(money(runningPeriods[0].balance), 500, "first period final balance should match computed result");
assert.equal(
  money(runningPeriods[1].previousBalance),
  money(runningPeriods[0].balance),
  "next period should inherit prior final balance"
);
assert.equal(money(runningPeriods[1].balance), 700, "second period should continue the running balance");

console.log(
  JSON.stringify(
    {
      ok: true,
      caseResults,
      runningBalanceCheck: {
        firstPeriodPrevious: money(runningPeriods[0].previousBalance),
        firstPeriodBalance: money(runningPeriods[0].balance),
        secondPeriodPrevious: money(runningPeriods[1].previousBalance),
        secondPeriodBalance: money(runningPeriods[1].balance),
      },
    },
    null,
    2
  )
);
