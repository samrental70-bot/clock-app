# OPERA.AI Production DB Backup Report

Date: 2026-06-30T03:03:32.161Z

- Production ref confirmed: ...evhyjm
- Development ref confirmed separate: ...jjwbut
- Backup method: Supabase REST app-table JSON export using hidden local service role key
- Backup file path: C:\Users\samra\clock-app\backups\production\OPERA_PROD_BACKUP_20260629_2303.json
- Backup file size: 2567263 bytes
- SHA256: f5ecd8f7659a38d4c22d8a1d41a61c817caf12cd17de33fa80a2f46abc2c5358
- Backup command completed successfully: yes
- Backup file is under ignored backups/ folder: yes
- Secrets printed: no
- Production SQL run during backup: no
- Production Storage touched: no

## Table Export Summary

| Table | Status | Row count | Exported rows |
| --- | --- | ---: | ---: |
| companies | exists | 4 | 4 |
| company_members | exists | 22 | 22 |
| profiles | exists | 24 | 24 |
| projects | exists | 12 | 12 |
| cost_centres | exists | 91 | 91 |
| timesheets | exists | 260 | 260 |
| project_media | exists | 553 | 553 |
| notifications | exists | 772 | 772 |
| live_locations | exists | 11 | 11 |
| project_assignments | exists | 114 | 114 |
| project_cost_centre_assignments | exists | 1071 | 1071 |
| project_list_items | exists | 18 | 18 |
| push_subscriptions | exists | 4 | 4 |
| scheduled_task_assignees | exists | 4 | 4 |
| scheduled_tasks | exists | 7 | 7 |
| timesheet_change_requests | exists | 11 | 11 |
| video_projects | missing (PGRST205) | - | 0 |
| render_jobs | missing (PGRST205) | - | 0 |
| employee_pay_rates | missing (PGRST205) | - | 0 |
| daily_report_logs | missing (PGRST205) | - | 0 |
| chat_conversations | missing (PGRST205) | - | 0 |
| chat_conversation_members | missing (PGRST205) | - | 0 |
| chat_messages | missing (PGRST205) | - | 0 |
| chat_members | missing (PGRST205) | - | 0 |

## Restore Note

This is an application-table JSON export for fallback/data recovery support before additive SQL. It is not a full Supabase platform backup and does not include Supabase Storage or auth internals. Use Supabase dashboard backups or pg_dump in addition if available before high-risk operations.
