# Apple App Privacy Notes

These notes are a planning draft. Final Apple App Privacy answers must be verified before submission.

## Likely App Privacy Label Categories
- Contact Info: name and email.
- Location: clock-in/out and live location where enabled.
- User Content: job-site photos, receipt images, uploaded media, notes if applicable.
- Identifiers: possible auth identifiers, push notification identifiers, or device identifiers if used.
- Usage Data: only if analytics are added or already configured.
- Diagnostics: only if crash logs or diagnostics are collected.

## Linked to User
Likely yes for account and work records because timesheets, locations, photos, receipts, and schedules are tied to a user/company account.

## Tracking
Likely no, unless advertising or third-party tracking is added. Verify SDKs and data sharing before submission.

## Required Final Checks
- Verify every SDK and provider.
- Verify whether any data is used for tracking.
- Verify whether any data is shared beyond service providers.
- Verify privacy policy language matches App Privacy answers.
- Provide a privacy policy URL in App Store Connect.

## Official References
- Apple app information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Apple app review guidance: https://developer.apple.com/app-store/review/
