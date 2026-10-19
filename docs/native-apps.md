# Windows, macOS and Android apps (Tauri 2)

**These downloads are client apps only and require a running Glass Keep server.** They bundle the Glass Keep interface and connect to your existing self-hosted server; they do not install or run the server, SQLite, Express or the AI model. Deploy Glass Keep separately and enter its server URL in the client. Use server 1.0.6 or newer for the complete current feature set.

## Connect and use

1. Install the Windows setup executable for your processor (x64 for most PCs, ARM64 for Windows on ARM), or the signed ARM64 APK for Android 7.0 and newer.
2. Start Glass Keep and enter the public server origin, such as `https://keep.example.com`. Do not include `/api`, a path, or a login token.
3. Sign in with your existing Glass Keep account. Your server's registration policy still applies.

On macOS 13 or newer, download the **arm64** DMG for Apple Silicon (M-series) or the **x64** DMG for an Intel Mac. Open the disk image, drag Glass Keep into Applications, and launch it from there. These previews use an ad-hoc (local) signature and are not Apple-notarized, so macOS may block the first launch. If you trust the downloaded release, use **System Settings → Privacy & Security → Open Anyway**, following [Apple's instructions](https://support.apple.com/en-us/102445). Developer ID signing and notarization require the owner's Apple Developer credentials and are not configured in this preview.

Open **Menu → Settings → Connected server** to see your server link or choose **Change server**. Before signing in, use **Connection settings** on the login screen. Each server has separate login, cached notes and offline operations, even if both instances have user ID 1. Pending edits remain associated with the original server; switching back allows them to sync. Sign out clears the current server's browser cache and session without removing other server connections.

The notes interface is bundled, so it can open offline after setup. Owned notes that have been loaded remain available through the existing offline queue. Server-side AI, administration, sharing and fresh exports still need a reachable server. Collaboration refreshes every ten seconds while the native client is visible, and when its window regains focus; the web version continues using realtime events.

Backups, Markdown exports, images and unsynced drafts use the system save dialog. Import uses the existing file picker. External note links open in your normal browser, and copied note/public links point to the selected server instead of a local app address.

Client 1.0.5 adds **Settings → Automatic JSON export**, with 1/7/30-day schedules and files saved to your chosen folder while the app is open (default: **Downloads/Glass Keep**). Android 7–9 requires choosing a folder. See the [export guide](automatic-exports.md). No Google/Microsoft provider setup is required.

Use HTTPS outside a trusted local network. HTTP is supported for LAN deployments, and the connection screen explains that it is unencrypted. Certificate validation remains enabled; use a publicly trusted certificate (custom/self-signed CA import is not included yet). Enter the final server origin because API redirects are rejected to avoid forwarding authentication to another host. No new CORS setting is required on the server.

## Build

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): Node 24, stable Rust, the Windows C++ build tools/WebView2 for Windows, Xcode command-line tools on a Mac, and Java 17 plus Android SDK/NDK for Android.

```sh
npm ci
npm run native:build
npm run app:windows
```

Windows installers appear under `src-tauri/target/release/bundle/nsis/`. Desktop development uses `npm run tauri -- dev`.

The workflow also saves the portable `glass-keep.exe`. The setup installer is recommended because it can install WebView2 when needed; the portable executable needs an existing WebView2 runtime.

On a Mac, run `npm ci` then `npm run app:macos`. The platform config creates an `.app` under `src-tauri/target/release/bundle/macos/` and a DMG under `src-tauri/target/release/bundle/dmg/`, using the checked-in Mac icon and a local signature. Each build uses the Mac's native processor architecture. The default Windows packaging configuration remains separate.

For Android, set `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` as documented by Tauri, then:

```sh
npm run tauri -- android init --ci
npm run app:android
```

`npm run app:android` installs the checked-in Glass Keep standard, round and adaptive icons into the generated Android project before building, so initialization cannot leave Tauri's default launcher icon in the APK. Android output appears under `src-tauri/gen/android/app/build/outputs/apk/`. Generated platform projects and build output are ignored by Git. Linux packaging is not configured yet.

## Signing and automated builds

Run **Actions → Native apps → Run workflow** on GitHub. Choose all platforms or one platform. The workflow builds Windows x64 and ARM64 setup executables, macOS Apple Silicon and Intel DMGs, and an Android ARM64 APK. Build artifacts remain attached to the workflow run; releases can attach the tested outputs without recompiling.

Windows installers currently have no commercial publisher certificate. Android distribution requires a stable signing identity so newer versions can update the installed application. The workflow uses these encrypted repository secrets when approved/configured:

- `ANDROID_KEYSTORE_BASE64`: base64 bytes of the private release JKS keystore.
- `ANDROID_KEYSTORE_PASSWORD`: its password.
- `ANDROID_KEY_PASSWORD`: password of the `glass-keep` alias.

`node scripts/prepare-android.mjs` configures the generated Gradle project from these secrets. It writes no passwords into tracked files. Without the secrets, the workflow produces an **unsigned APK**, which is a build output and cannot be installed as a normal release app. It never silently generates a replacement signing identity. Keep a private backup of the approved signing key/password; do not commit them or attach them to releases.

## Verification

Client 1.0.5 was tested on the same Android 16 phone with only a temporary account: selecting a unique export folder, writing valid JSON, restarting the app and writing again with the remembered permission, opened-note status-bar spacing, hardware Back returning to the notes list, and the padded launcher icon. The original server selection was restored afterward. The compiled Windows ARM64 client also saved a valid JSON file through the real Rust command and rejected an unapproved destination. Automated browser tests additionally cover remembered web folder handles and overdue exports after reload.

Client 1.0.2 was also tested on the owner's Samsung SM-S938U1 running Android 16 through wireless debugging, using a temporary local server and test account. Checks covered connection, login, note creation, an offline note surviving an in-place APK update, later synchronization, ZIP saving through Android's document picker, ZIP import with duplicate detection, and the corrected cloud dialog and language picker colours. No production notes or cloud-provider credentials were used.

`npm test` covers existing server/data behavior and native address validation. Build both web and native assets, then run:

```sh
node --test tests/browser.test.mjs tests/web-features.browser.mjs tests/auto-export.browser.mjs tests/native.browser.mjs
```

The native browser test runs the bundled client against two real local servers with simulated Tauri IPC, covering login, note creation, offline operations, server isolation, logout and automatic native JSON saving. Rust tests reject API paths that escape the selected origin and invalid export filenames. Physical device checks supplement compilation and browser/IPC tests. Home-screen widgets and Google Play distribution are not included in this first client.

On each Mac runner, the workflow also verifies Rust origin restrictions, the packaged app's architecture/version/minimum OS, its local code signature, DMG integrity, and that the packaged app stays running through initialization. These checks do not replace interactive Mac testing of login, notes, dialogs and scheduled file saving.

On Windows, `tests/native-windows.browser.mjs` additionally launches the compiled executable with an isolated temporary WebView2 profile and a temporary local API. Set `GLASS_KEEP_WINDOWS_EXE` to the portable executable's absolute path, then run `node --test tests/native-windows.browser.mjs`. This checks the real Rust transport, login, a persisted note, reload and cross-origin path rejection without touching the normal app profile.
