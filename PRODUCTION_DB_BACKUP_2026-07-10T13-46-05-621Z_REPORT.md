# OPERA.AI Production DB Backup Report

Date: 2026-07-10T13:46:05.621Z

## Target

- Production Supabase ref: `vunw...vhyjm`
- Backup type: Supabase REST app-table JSON export using local production service role key
- Backup is read-only: yes
- Production SQL run: no
- Production database altered: no
- Supabase Storage touched: no
- Secrets printed: no

## Backup File

- File: `C:\Users\samra\clock-app\backups\production\OPERA_PROD_BACKUP_2026-07-10T13-46-05-621Z.json`
- Size: `2796137 bytes`
- SHA256: `055196ef6d1ab88747fc1f8199f3550c64e2043b4f6d4819cdb5f622c0561383`
- Folder ignored by git: `backups/`

## Table Summary

| Table | Status | Rows | Note |
|---|---:|---:|---|
| companies | exists | 4 |  |
| company_members | exists | 23 |  |
| profiles | exists | 25 |  |
| projects | exists | 15 |  |
| cost_centres | exists | 157 |  |
| timesheets | exists | 318 |  |
| project_media | exists | 643 |  |
| notifications | exists | 1063 |  |
| employee_pay_rates | exists | 6 |  |
| payroll_settings | exists | 0 |  |
| payroll_payments | exists | 1 |  |
| payroll_balance_adjustments | exists | 4 |  |
| employee_loan_transactions | exists | 0 |  |
| employee_vacation_periods | exists | 0 |  |
| chat_conversations | exists | 2 |  |
| chat_members | missing |  | HTTP 404 |
| chat_conversation_members | exists | 16 |  |
| chat_messages | exists | 6 |  |
| chat_message_attachments | exists | 0 |  |
| chat_message_checklist_items | exists | 0 |  |
| chat_pins | exists | 0 |  |
| chat_lists | exists | 1 |  |
| chat_list_items | exists | 2 |  |
| daily_report_logs | exists | 0 |  |
| live_locations | exists | 12 |  |
| timesheet_change_requests | exists | 24 |  |

## Notes

- This is an application-table backup, not a full Supabase platform backup and not a Storage-file backup.
- Missing optional tables are listed above if the current production schema does not include them.
- Existing production data was only read/exported.
