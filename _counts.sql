select 'companies' as table_name, count(*)::bigint as row_count from public.companies
union all select 'company_members', count(*)::bigint from public.company_members
union all select 'profiles', count(*)::bigint from public.profiles
union all select 'projects', count(*)::bigint from public.projects
union all select 'cost_centres', count(*)::bigint from public.cost_centres
union all select 'timesheets', count(*)::bigint from public.timesheets
union all select 'project_media', count(*)::bigint from public.project_media
union all select 'notifications', count(*)::bigint from public.notifications
union all select 'chat_conversations', count(*)::bigint from public.chat_conversations
union all select 'chat_conversation_members', count(*)::bigint from public.chat_conversation_members
union all select 'chat_messages', count(*)::bigint from public.chat_messages
union all select 'chat_message_attachments', count(*)::bigint from public.chat_message_attachments
union all select 'chat_message_checklist_items', count(*)::bigint from public.chat_message_checklist_items
union all select 'chat_pins', count(*)::bigint from public.chat_pins
union all select 'chat_lists', count(*)::bigint from public.chat_lists
union all select 'chat_list_items', count(*)::bigint from public.chat_list_items
union all select 'live_locations', count(*)::bigint from public.live_locations
union all select 'daily_report_logs', count(*)::bigint from public.daily_report_logs
union all select 'employee_pay_rates', count(*)::bigint from public.employee_pay_rates
union all select 'payroll_settings', count(*)::bigint from public.payroll_settings
union all select 'payroll_payments', count(*)::bigint from public.payroll_payments
union all select 'payroll_balance_adjustments', count(*)::bigint from public.payroll_balance_adjustments
union all select 'employee_loan_transactions', count(*)::bigint from public.employee_loan_transactions
union all select 'employee_vacation_periods', count(*)::bigint from public.employee_vacation_periods
order by table_name;
