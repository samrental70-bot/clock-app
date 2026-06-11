# Native Wrapper Plan

## Why a Wrapper Is Needed
The current app is a Vite/React PWA. App Store and Google Play launches usually require native app packages. A wrapper lets the existing web app run inside iOS and Android native shells while preserving the current web app architecture.

## Recommended Wrapper
Capacitor is the recommended path for this project because it is designed to wrap modern web apps and generate native iOS/Android projects.

## iOS Steps Overview
1. Install Capacitor packages.
2. Initialize app with final app name and bundle ID.
3. Add iOS platform.
4. Build web app.
5. Sync Capacitor.
6. Open Xcode.
7. Set signing/team.
8. Configure permissions.
9. Archive.
10. Upload to App Store Connect.

## Android Steps Overview
1. Add Android platform.
2. Build web app.
3. Sync Capacitor.
4. Open Android Studio.
5. Configure package name/version.
6. Configure permissions.
7. Generate signed AAB.
8. Upload to Play Console internal testing.

## Permissions to Verify
- Camera/photos.
- Location.
- Notifications.

## Risks
- PWA browser APIs may behave differently in a native wrapper.
- Push notification handling may need native setup.
- File/photo upload permissions need device testing.
- Background location/live tracking may require careful policy compliance.
- Store privacy declarations must match real native behavior.

## Security Rule
Do not commit private keys, keystores, certificates, provisioning profiles, or API keys. Store them in approved secure systems only.
