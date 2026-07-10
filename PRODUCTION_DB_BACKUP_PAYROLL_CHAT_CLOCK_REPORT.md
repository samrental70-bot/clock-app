# OPERA.AI Production DB Backup Report - Payroll/Chat/Clock Gate

Date: 2026-07-04T02:47:27.265Z

## Target

- Production Supabase ref: `...evhyjm`
- Development Supabase ref: `...jjwbut`
- Backup taken before any production SQL execution in this gate: yes

## Backup Details

- Backup method: Supabase REST app-table JSON export using the production service role key
- Backup file: `C:\Users\samra\clock-app\backups\production\OPERA_PROD_BACKUP_2026-07-04T02-47-27-265Z.json`
- Backup file size: `2392124 bytes`
- SHA256: `0564baeefe0bffb408c839f608c5b12a3605d4be6fdd80c25d8894f6a5772aaa`
- Backup completed successfully: yes
- Backup stored under ignored `backups/` folder: yes
- Secrets printed during backup: no
- Supabase Storage touched during backup: no
- Production SQL run during backup: no

## Notes

- This backup is the fresh checkpoint for the approved production SQL gate.
- The backup is application-table JSON only and is not a full Supabase platform dump.
- Production data must still be compared against postflight row counts after SQL execution.
