# Importing large Google Keep exports

Open **Settings → Import Google Keep (ZIP / folder / JSON)**. Choose the Google
Takeout ZIP, or extract it and choose the exported **Keep** folder. Include the
JSON note files and their attachments together. Keep's duplicate HTML files are
not needed. The dialog previews notes before uploading anything.

From **1.0.19**, selecting a Takeout ZIP through **Import backup** automatically
opens the Google Keep importer. That backup option is otherwise for Glass Keep's
own JSON or `backup.json` ZIP format, which retains its 200 MiB limit.

## Large archives

The Google Keep importer no longer has the old 100 MiB cap. It indexes the ZIP
using small file slices and loads attachments only as their notes are prepared
for API batches. It does not read or decompress the entire archive at once. This
supports ordinary 400+ MB Takeout ZIPs; the regression fixture is a synthetic
450 MiB archive, not a reporter's private export.

For large exports, use a desktop with enough available memory and keep the app
open until the import finishes. Progress reports completed note batches. On a
device with limited memory, try the extracted Keep folder. The app still needs
memory to display and cache the final imported notes and images.

Limits remain to reject malformed or unexpectedly large content:

- ZIP file: up to 2 GiB; standard stored/DEFLATE entries with UTF-8-compatible names.
- Indexed files: up to 50,000, 4 GiB total declared unpacked content and a 16 MiB
  ZIP directory. Folder imports have the file-count and total-content limits too.
- Note JSON: up to 2 MiB per file and 64 MiB combined metadata.
- Supported image attachments: up to 12 MiB each; the full encoded note must fit
  the existing 19 MiB import payload guard. A ZIP can be large while its individual
  notes remain small enough to import.
- ZIP64, encrypted and multidisk archives are not supported directly. Extract
  them and select the Keep folder instead. Corrupt data, unsafe paths, mismatched
  sizes and failed CRC checks are rejected.

If a note is too large, reduce its attachment sizes before retrying. The error
reports how many notes were processed before stopping. Successful earlier batches
remain saved; keep **Skip duplicate notes** enabled when retrying. Closing the
dialog stops further preparation/batches; a request already accepted by the server
may finish. Large previews show only the first 100 titles, but import all ready notes.

## Ownership and sharing

Trashed notes are skipped. **Import only notes I own** is on by default; supply
the Google Keep account email when explicit ownership is present in the export.
Sharing restoration is off by default and is optional: it matches existing Glass
Keep accounts, reports unmatched users, and can grant editing access. Review the
dialog's warning before enabling it.

Imports add notes to the signed-in account; they do not replace the whole database.
Existing archived notes, attachments and earlier backups remain intact. Automatic
JSON exports are described in [the export guide](automatic-exports.md).
