select table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema='public'
  and table_name in ('employee_pay_rates','payroll_settings','payroll_payments','payroll_balance_adjustments','employee_loan_transactions','employee_vacation_periods','timesheets')
group by table_name
order by table_name;
