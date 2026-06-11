# Technical Build Plan

## Current State
The current OPERA.AI app is a Vite / React PWA deployed on Vercel.

Present:
- Vite React app.
- PWA manifest.
- Service worker.
- Web icons.

Not present:
- Capacitor.
- Cordova.
- Expo / React Native.
- `android/` native project.
- `ios/` native project.

## Option A - PWA Only
The app can be installed from supported browsers as a PWA. This is useful for web distribution and quick team adoption.

Limitations:
- A PWA alone is generally not enough for a standard Apple App Store native listing.
- Google Play distribution generally requires an Android package such as an AAB/APK or a trusted web activity/native wrapper path.
- Store permissions, screenshots, review notes, and privacy declarations still need to match behavior.

## Option B - Capacitor Wrapper
Recommended path for the current Vite/React PWA.

Capacitor can wrap the web app into iOS and Android native shells:
- iOS build through Xcode.
- Android build through Android Studio/Gradle.
- Generates App Store / Play Store packages.

Future commands only. Do not run unless explicitly approved:

```powershell
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init
npx cap add ios
npx cap add android
npm run build
npx cap sync
npx cap open ios
npx cap open android
```

## Option C - React Native Rebuild
This is a larger future option. It is not needed for the current launch package.

## Recommendation
Prepare a Capacitor wrapper in a separate future implementation task after launch documents, app name, bundle IDs, and store assets are approved.

## Do Not Run Now
- Do not install native packages.
- Do not create native folders.
- Do not generate signing assets.
- Do not commit keystores, provisioning profiles, private keys, or certificates.
