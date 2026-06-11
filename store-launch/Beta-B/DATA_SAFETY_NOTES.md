# Google Play Data Safety Notes

These notes are a planning draft. Final Google Play Data Safety answers must be verified against the actual production app, SDKs, analytics, crash reporting, push notification setup, privacy policy, and backend behavior before submission.

## Likely Data Categories

| Data category | Collected? | Shared? | Purpose | Encrypted in transit? | Deletion process |
| --- | --- | --- | --- | --- | --- |
| Personal info: name, email | Yes | Service providers only | Account identity, company membership, app access | Yes, verify final transport/security details | Placeholder request process |
| Location: approximate/precise | Depends on permissions and company settings | Service providers only | Clock-in/out verification, live location where enabled | Yes, verify final transport/security details | Placeholder request process |
| Photos/videos | Yes if uploaded | Service providers only | Job-site documentation | Yes, verify final transport/security details | Placeholder request process |
| Files/documents: receipts/media | Yes if uploaded | Service providers only | Expense/project documentation | Yes, verify final transport/security details | Placeholder request process |
| App activity: clock-in/out and task responses | Yes | Service providers only | Time tracking, scheduling, reporting | Yes, verify final transport/security details | Placeholder request process |
| Device or other IDs | Depends on auth, push, analytics, or crash tooling | Depends on providers | Authentication, notifications, reliability | Yes, verify final transport/security details | Placeholder request process |

## Important Verification Items
- Confirm whether analytics or crash reporting SDKs are present.
- Confirm whether push notification tokens are stored.
- Confirm whether precise location is requested or only approximate location is used.
- Confirm receipt/photo storage retention.
- Confirm deletion and export workflow before submitting final answers.

## Official Reference
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
