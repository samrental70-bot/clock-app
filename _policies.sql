select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'employee_pay_rates','payroll_settings','payroll_payments','payroll_balance_adjustments','employee_loan_transactions','employee_vacation_periods',
    'daily_report_logs','chat_conversations','chat_conversation_members','chat_messages','chat_message_attachments','chat_message_checklist_items','chat_pins','chat_lists','chat_list_items','live_locations','project_media'
  )
order by tablename, policyname;
