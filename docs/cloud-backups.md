# Personal cloud backups

Glass Keep 1.0.6 lets each user connect Google Drive, OneDrive, or both from **Settings → Cloud backup**. Choose every **1, 7, or 30 days**, or use **Back up now**. The server runs scheduled backups even when the browser is closed.

## What is saved

Each compressed ZIP contains one portable `backup.json`: the signed-in user's owned notes, including archived notes, text, nested checklists, tags, colors, pinning, ordering and embedded images/drawings. Notes owned by collaborators are excluded. Accounts, passwords, recovery keys, collaborator permissions, public share links and server configuration are excluded.

The newest **three snapshots per user and provider** are retained. An upload must pass size verification (and checksum verification where supplied) before older copies are removed. Unchanged notes do not create duplicate snapshots; the server first confirms that the previous cloud copy still exists. If it was deleted, a fresh copy is uploaded.

These are ordinary, readable ZIP files, not password-encrypted archives. Keep the cloud backup folder private. Disconnecting removes the saved connection from Glass Keep but keeps files already in the cloud.

## Restore without the original server

1. Download a ZIP from Google Drive or OneDrive to your device.
2. Sign in to any Glass Keep 1.0.6 or newer instance.
3. Open **Settings → Cloud backup → Import backup**, or use the normal backup import, and choose the ZIP directly.

Import merges notes into the current account, preserving existing notes and skipping duplicates. Sharing permissions are not restored. Legacy Glass Keep JSON exports also work. **Download backup ZIP** creates the same format without connecting a cloud account.

Google Drive uses a visible `Glass Keep Backups …` folder. OneDrive uses a `Glass Keep Backups …` subfolder inside the application's folder under **Apps**; the application folder name is determined by the Microsoft registration. Each installation and user gets its own opaque folder suffix.

## One-time server setup

The instance owner registers an OAuth application with each provider they want to enable. Ordinary users then connect their own accounts through the provider's sign-in screen; they do not enter client secrets. No shared OAuth credentials are bundled in the Docker image.

This is one-time application setup, not administrator approval for each user. Google and Microsoft need a registered application ID and an approved callback address before they can offer consent and issue tokens. Once the owner configures a provider, every ordinary Glass Keep user can connect their own cloud account independently. The owner does not enter users' cloud passwords or connect a shared cloud account. The server retains each user's authorized tokens to run scheduled backups while their devices are offline. Simply pasting a Drive/OneDrive folder link does not grant permission to upload files.

In Portainer, edit the container/stack environment, add the values below, and recreate/update the container while retaining its existing data mount:

```env
CLOUD_BACKUP_PUBLIC_URL=https://keep.example.com
GOOGLE_DRIVE_CLIENT_ID=your-google-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-google-client-secret
ONEDRIVE_CLIENT_ID=your-microsoft-application-client-id
ONEDRIVE_CLIENT_SECRET=your-microsoft-client-secret-value
TRUST_PROXY=1
```

Replace `https://keep.example.com` with the exact public origin of your installation, without a path, query or fragment. HTTPS is required except for local development on `http://localhost` or `http://127.0.0.1`. `TRUST_PROXY=1` applies when one Nginx Proxy Manager sits in front of the app, as in the existing deployment. Keep your existing database mount and other environment settings.

You can enable only one provider by omitting the other provider's credentials. Until credentials and the public URL are configured, that provider's Connect button explains that server setup is needed. ZIP download and import still work.

### Google Drive

1. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Drive API**, and configure the Google Auth Platform consent screen/audience.
2. Create an OAuth client of type **Web application**.
3. Register this exact authorized redirect URI, replacing the example origin:
   `https://keep.example.com/api/cloud-backup/callback/google`
4. Configure the requested scope `https://www.googleapis.com/auth/drive.file`. This permits access to files created/opened with this application instead of the whole drive. Add test users when testing.
5. Copy the client ID and client secret into the corresponding environment variables above.
6. For continuing daily/weekly/monthly backups, use the appropriate production publishing status. An external application left in **Testing** normally receives refresh tokens that expire after seven days for this scope. After changing publishing status, reconnect the account in Glass Keep.

See Google's [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [OAuth token expiration rules](https://developers.google.com/identity/protocols/oauth2/). Complete any provider verification or consent requirements applicable to your registration.

### OneDrive

1. Create an application in [Microsoft Entra app registrations](https://entra.microsoft.com/). Enable personal Microsoft accounts; choose accounts in any organizational directory **and** personal Microsoft accounts if you also want organization accounts. Glass Keep uses the common Microsoft sign-in endpoint.
2. Add a **Web** platform with this exact redirect URI:
   `https://keep.example.com/api/cloud-backup/callback/onedrive`
3. Add Microsoft Graph **delegated** permission `Files.ReadWrite.AppFolder` and allow `offline_access`. Glass Keep requests these scopes when connecting. Remove unrelated default permissions if you do not need them.
4. Create a client secret. Put its **Value**, not its secret ID, in `ONEDRIVE_CLIENT_SECRET`, and the application/client ID in `ONEDRIVE_CLIENT_ID`. Record its expiry and rotate it before it expires.
5. Recreate the container, then connect from Glass Keep. Organization policies may require approval and can restrict access; validate with the accounts you intend to support.

See Microsoft's [application folder documentation](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder) and [web application registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).

## Scheduling, storage and troubleshooting

- The first backup is due immediately after connecting. Due jobs are checked once per minute. Later runs are scheduled 1/7/30 days after the previous successful check, rather than at a fixed calendar time.
- The server must be running and have internet access. Due schedules survive restarts. A job interrupted by a crash can take up to 30 minutes for its lease to expire before retrying.
- Failures are shown in Cloud backup and retried after 15 minutes, increasing to a maximum six-hour delay. Reconnect if provider authorization is revoked or expired. Old snapshots remain when upload verification fails; temporary retention-cleanup failures can leave more than three files until a later successful cleanup.
- Each archive and its uncompressed JSON are limited to **200 MB**. The existing import limit of approximately **19 MB per note** also applies. Embedded images consume most backup space. No archive history is stored on the server; compression uses memory and uploads the resulting ZIP.
- OAuth tokens are encrypted with AES-256-GCM using an automatically created `cloud-backup.key` beside the SQLite database. Preserve this file in the existing persistent data volume and never publish it. It is independent of `JWT_SECRET`. Losing it requires reconnecting cloud accounts and may create a new backup folder; old ZIPs can still be downloaded and imported.
- Removing a cloud connection does not revoke the provider application's consent. You can additionally revoke consent in your Google/Microsoft account settings. Uninstalling or moving the instance does not delete remote backups.
- This feature backs up personal notes. It does not provide whole-server recovery, account recovery, or a guarantee for unsynced drafts held only in a browser.

## Validation

Automated tests cover account isolation, encrypted token storage, OAuth state/cookie binding and PKCE, token refresh, restart scheduling, retention, failed uploads, malicious ZIP rejection, provider REST request/response handling, and browser download/import with images. Provider REST tests use simulated Google and Microsoft services. A live account connection must be verified after configuring your deployment's OAuth credentials.
