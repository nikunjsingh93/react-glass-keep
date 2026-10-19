# Automatic JSON exports

Open **Settings → Automatic JSON export** and select **1, 7, or 30 days**. Use **Choose export folder** to select a folder you already sync, or leave the default Downloads destination. Choose **Off** to stop. Enabling the schedule requests the first export immediately when there is no previous export; **Download JSON now** works independently of the schedule.

Each file contains the signed-in user's synced owned notes, including archived notes, checklists, tags, drawings and embedded attachments. Other users' notes, collaborator-owned notes, accounts, passwords, public links and sharing permissions are excluded. Save and sync drafts before exporting. Import the `.json` through **Settings → Import backup** on any compatible Glass Keep server; existing JSON and ZIP backups remain supported and imports skip duplicate notes.

## When it runs

The app checks every minute while open and visible, and on reopening, returning to the window or reconnecting. It must be signed in and able to reach its server. A missed schedule produces one current export when you return, rather than a file for every missed day. The next export is due 1/7/30 days after the last completed save or browser download request. Failures remain visible in Settings and retry after fifteen minutes. Use Download JSON now to retry immediately.

Schedules are stored locally per account and server, independently on each device/browser. They survive restarts and sign-out, but no export runs while signed out. Clearing app/browser storage removes the schedule. Keep Glass Keep open on a device if you want regular unattended exports. This is not a server job or an operating-system background service.

## Where files go

- **Windows/macOS/Linux clients:** your selected folder, remembered across restarts; the default is `Downloads/Glass Keep` in your user profile. Files save without a location prompt after selection.
- **Android:** select a folder through the system folder picker and approve access. That permission persists across restarts. Android may restrict root/protected folders; choose a subfolder that your sync app can also access. Android 10+ can alternatively save to the public `Download/Glass Keep` folder by default; Android 7–9 requires a chosen folder. No broad storage permission is needed.
- **Web/PWA:** Chrome/Edge on supported systems can select and remember a folder using the File System Access API. If permission expires after restarting, choose the folder again. Firefox/Safari and other unsupported browsers use the browser's normal download location. Allow automatic downloads for the Glass Keep site. If your browser is configured to ask for each location, it can still prompt. Browsers do not confirm that a download reached the disk; the UI therefore says **Last export requested**. Check the browser downloads list. On browsers that block scheduled downloads, use Download JSON now.

Point Syncthing or your preferred sync service at that folder yourself. Glass Keep does not connect to or configure the sync service. Exports have unique timestamped filenames; existing files are not overwritten or automatically deleted. Remove older exports yourself to manage storage. JSON is uncompressed and not password-encrypted, so keep the backup folder private.

## Updating from cloud backups

Server 1.0.9 and clients 1.0.5 replace Google Drive/OneDrive connections with local exports. No OAuth environment variables are required. Existing notes and downloaded/cloud backup files are preserved; the server no longer schedules cloud uploads. Existing cloud database tables/key files are left untouched but unused. You may revoke Glass Keep's access in Google/Microsoft account settings and remove the old provider environment variables. Older clients should be updated to see the new Settings option.
