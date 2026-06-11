# OPERA.AI Beta Release B Store Launch Package

## Purpose
This folder prepares the documentation, metadata, privacy notes, asset checklist, and technical plan needed to launch OPERA.AI Beta Release B on Apple App Store and Google Play.

This is a launch-preparation package only. It does not include app functionality changes, OCR work, SQL, database changes, private keys, certificates, provisioning profiles, keystores, or environment files.

## Current Project Inspection
- Project type: Vite / React PWA deployed on Vercel.
- Native wrapper: not present.
- Capacitor: not present.
- Cordova: not present.
- Expo / React Native: not present.
- Android folder: not present.
- iOS folder: not present.
- PWA manifest: present at `public/manifest.json` and `public/manifest-development.json`.
- Service worker: present at `public/service-worker.js`.
- App icons: present at `public/icon-192.png`, `public/icon-512.png`, `public/icon-development-192.png`, and `public/icon-development-512.png`.
- Splash/native store icons: not yet prepared as a complete App Store / Play Store asset set.
- Current production URL: https://project-rui1d.vercel.app
- Current development URL: https://project-rui1d-development.vercel.app

## Package Contents
- `APP_STORE_METADATA.md`: Apple App Store Connect metadata draft.
- `GOOGLE_PLAY_METADATA.md`: Google Play listing and app content metadata draft.
- `PRIVACY_POLICY_DRAFT.md`: Practical privacy policy draft for legal review.
- `DATA_SAFETY_NOTES.md`: Google Play Data Safety planning notes.
- `APP_PRIVACY_NOTES.md`: Apple App Privacy label planning notes.
- `REVIEW_NOTES.md`: App review notes and demo-account planning.
- `SCREENSHOT_PLAN.md`: Required screenshot sequence and caption plan.
- `ASSET_CHECKLIST.md`: Common, Apple-specific, and Google-specific assets needed.
- `TECHNICAL_BUILD_PLAN.md`: PWA vs native-wrapper build options.
- `RELEASE_NOTES_B.md`: Beta Release B notes.
- `TESTING_CHECKLIST.md`: Pre-submission testing checklist.
- `NATIVE_WRAPPER_PLAN.md`: Recommended Capacitor wrapper plan for future implementation.
- `files-needed/README.md`: Placeholder for manually supplied store assets.

## Launch Readiness Status
Ready now:
- Store metadata drafts.
- Privacy and app-content planning drafts.
- Screenshot and asset requirements checklist.
- Native-wrapper plan.
- Beta Release B release notes.

Still needed:
- Final app name.
- Final legal company name.
- Public privacy policy URL.
- Public support URL.
- Demo owner and employee accounts for review.
- Store screenshots showing real app UI.
- App Store / Play Store app icon and graphics.
- Native iOS/Android wrapper decision.
- iOS archive and Android AAB once wrapper is approved.

## Recommended Next Steps
1. Confirm final app name.
2. Confirm legal company name.
3. Confirm privacy policy and support URLs.
4. Create demo owner and employee accounts.
5. Prepare screenshots from real Beta Release B UI.
6. Decide native wrapper path.
7. Build iOS and Android packages in a separate approved implementation task.
8. Submit to internal testing first.
9. Submit for review / production release after QA.

## Official References
- Apple App Store Connect app information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Apple screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
- Apple app review guidance: https://developer.apple.com/app-store/review/
- Google Play preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
