# Windows and Android apps (Tauri 2)

These installable clients bundle the Glass Keep interface. They connect to your existing self-hosted Glass Keep server; they do not start a second server or embed SQLite, Express or the AI model. Use server 1.0.6 or newer for the complete current feature set.

## Connect and use

1. Install the Windows setup executable for your processor (x64 for most PCs, ARM64 for Windows on ARM), or the signed ARM64 APK for Android 7.0 and newer.
2. Start Glass Keep and enter the public server origin, such as `https://keep.example.com`. Do not include `/api`, a path, or a login token.
3. Sign in with your existing Glass Keep account. Your server's registration policy still applies.

Use **Change server** in the top bar to connect to another instance. Each server has separate login, cached notes and offline operations, even if both instances have user ID 1. Pending edits remain associated with the original server; switching back allows them to sync. Sign out clears the current server's browser cache and session without removing other server connections.

The notes interface is bundled, so it can open offline after setup. Owned notes that have been loaded remain available through the existing offline queue. Server-side AI, administration, sharing and cloud jobs still need a reachable server. Collaboration refreshes every ten seconds while the native client is visible, and when its window regains focus; the web version continues using realtime events.

Backups, Markdown exports, images and unsynced drafts use the system save dialog. Import uses the existing file picker. External note links open in your normal browser, and copied note/public links point to the selected server instead of a local app address.

Cloud-account authorization opens your server in the normal browser because Google/Microsoft authentication must run outside the app webview. Sign in to the same Glass Keep account there, complete the cloud connection, then return to the app. Backup status updates automatically.

Use HTTPS outside a trusted local network. HTTP is supported for LAN deployments, and the connection screen explains that it is unencrypted. Certificate validation remains enabled; private/self-signed certificates must be trusted by the device. Enter the final server origin because API redirects are rejected to avoid forwarding authentication to another host. No new CORS setting is required on the server.

## Build

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): Node 24, stable Rust, the Windows C++ build tools/WebView2 for Windows, and Java 17 plus Android SDK/NDK for Android.

```sh
npm ci
npm run native:build
npm run app:windows
```

Windows installers appear under `src-tauri/target/release/bundle/nsis/`. Desktop development uses `npm run tauri -- dev`.

For Android, set `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` as documented by Tauri, then:

```sh
npm run tauri -- android init --ci
npm run tauri -- icon public/pwa-512.png
npm run app:android
```

Android output appears under `src-tauri/gen/android/app/build/outputs/apk/`. Generated platform projects and build output are ignored by Git. The checked-in native project can also support macOS/Linux later, but this first workflow builds Windows and Android only.

## Signing and automated builds

Run **Actions → Native apps → Run workflow** on GitHub. Choose all platforms or one platform. The workflow builds Windows x64 and ARM64 setup executables and an Android ARM64 APK. Build artifacts remain attached to the workflow run; releases can attach the tested outputs without recompiling.

Windows installers currently have no commercial publisher certificate. Android distribution requires a stable signing identity so newer versions can update the installed application. The workflow uses these encrypted repository secrets when approved/configured:

- `ANDROID_KEYSTORE_BASE64`: base64 bytes of the private release JKS keystore.
- `ANDROID_KEYSTORE_PASSWORD`: its password.
- `ANDROID_KEY_PASSWORD`: password of the `glass-keep` alias.

`node scripts/prepare-android.mjs` configures the generated Gradle project from these secrets. It writes no passwords into tracked files. Without the secrets, the workflow produces an **unsigned APK**, which is a build output and cannot be installed as a normal release app. It never silently generates a replacement signing identity. Keep a private backup of the approved signing key/password; do not commit them or attach them to releases.

## Verification

`npm test` covers existing server/data behavior and native address validation. Build both web and native assets, then run:

```sh
node --test tests/browser.test.mjs tests/web-features.browser.mjs tests/cloud-backup.browser.mjs tests/native.browser.mjs
```

The native browser test runs the bundled client against two real local servers with simulated Tauri IPC, covering login, note creation, offline operations, server isolation, logout and native ZIP saving. Rust tests reject API paths that escape the selected origin. Physical Android testing and live cloud-provider sign-in remain separate checks from compilation and browser/IPC tests. Home-screen widgets and Google Play distribution are not included in this first client.
