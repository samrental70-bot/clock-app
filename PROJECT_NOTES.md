# Employee Clock App – Working Version Notes

## Working Version: Auth Company Module

Date: May 3, 2026

This version is working locally in Cursor.

### Confirmed working
- Supabase login works
- Signup works
- Create company works
- Join company works with company code
- Logged-in user identity comes from Supabase auth
- Old hardcoded “Logged In User” dropdown removed
- Header shows logged-in user, company, and role
- Start Shift only asks for Project and Cost Centre
- Company/timesheets SQL and RLS added
- Startup/session timeout no longer blocks app

### Do not touch unless specifically requested
- handlePhotoCapture
- Supabase storage upload code
- project-photos bucket logic
- working photo upload flow

Do not change any app code. Only create PROJECT_NOTES.md.
