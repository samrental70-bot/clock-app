function money(value) {
  const amount = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(amount) ? amount : 0;
}

function comparePayrollPeriodsAscending(a, b) {
  const startCompare = String(a?.periodStart || a?.startKey || "").localeCompare(String(b?.periodStart || b?.startKey || ""));
  if (startCompare !== 0) return startCompare;
  return String(a?.periodEnd || a?.endKey || "").localeCompare(String(b?.periodEnd || b?.endKey || ""));
}

export function computePayrollPeriodBalance({
  previousBalance = 0,
  workedAmount = 0,
  contractAmount = 0,
  paidAmount = 0,
  loanGivenAmount = 0,
  loanReturnedAmount = 0,
}) {
  const normalizedPreviousBalance = money(previousBalance);
  const normalizedWorkedAmount = money(workedAmount);
  // Contract work is an earning (a fixed amount the company owes the employee),
  // so it adds to the balance just like hourly worked amount.
  const normalizedContractAmount = money(contractAmount);
  const normalizedPaidAmount = money(paidAmount);
  const normalizedLoanGivenAmount = money(loanGivenAmount);
  const normalizedLoanReturnedAmount = money(loanReturnedAmount);
  const loanNetAmount = normalizedLoanReturnedAmount - normalizedLoanGivenAmount;
  const balance =
    normalizedPreviousBalance +
    normalizedWorkedAmount +
    normalizedContractAmount -
    normalizedPaidAmount -
    normalizedLoanGivenAmount +
    normalizedLoanReturnedAmount;

  return {
    previousBalance: normalizedPreviousBalance,
    workedAmount: normalizedWorkedAmount,
    contractAmount: normalizedContractAmount,
    paidAmount: normalizedPaidAmount,
    loanGivenAmount: normalizedLoanGivenAmount,
    loanReturnedAmount: normalizedLoanReturnedAmount,
    loanNetAmount,
    balance,
  };
}

export function applyRunningPayrollBalances(periods, openingBalance = 0) {
  const ascending = [...(Array.isArray(periods) ? periods : [])].sort(comparePayrollPeriodsAscending);
  let runningBalance = money(openingBalance);

  return ascending.map((period) => {
    const computed = computePayrollPeriodBalance({
      previousBalance: runningBalance,
      workedAmount: period?.workedAmount,
      contractAmount: period?.contractAmount,
      paidAmount: period?.paidAmount,
      loanGivenAmount: period?.loanGivenAmount,
      loanReturnedAmount: period?.loanReturnedAmount,
    });
    runningBalance = computed.balance;
    return {
      ...period,
      ...computed,
    };
  });
}

export function summarizePayrollPeriods(periods, openingBalance = 0) {
  const normalizedPeriods = Array.isArray(periods) ? periods : [];
  const ascending = [...normalizedPeriods].sort(comparePayrollPeriodsAscending);
  const descending = [...ascending].reverse();
  const totals = normalizedPeriods.reduce(
    (summary, period) => {
      summary.workedMinutes += Number(period?.workedMinutes || 0) || 0;
      summary.workedAmount += money(period?.workedAmount);
      summary.contractAmount += money(period?.contractAmount);
      summary.paidAmount += money(period?.paidAmount);
      summary.loanGivenAmount += money(period?.loanGivenAmount);
      summary.loanReturnedAmount += money(period?.loanReturnedAmount);
      summary.loanNetAmount += money(period?.loanNetAmount);
      return summary;
    },
    {
      workedMinutes: 0,
      workedAmount: 0,
      contractAmount: 0,
      paidAmount: 0,
      loanGivenAmount: 0,
      loanReturnedAmount: 0,
      loanNetAmount: 0,
    }
  );

  return {
    ...totals,
    previousBalance: ascending.length > 0 ? money(ascending[0]?.previousBalance) : money(openingBalance),
    balance: descending.length > 0 ? money(descending[0]?.balance) : money(openingBalance),
  };
}
