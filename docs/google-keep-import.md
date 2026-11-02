# Importing large Google Keep exports

Open **Settings → Import Google Keep (ZIP / folder / JSON)**. Choose the Google
Takeout ZIP, or extract it and choose the exported **Keep** folder. Include the
JSON note files and their attachments together. Keep's duplicate HTML files are
not needed. The dialog previews notes before uploading anything.

The dialog has three visible buttons:

- **Choose Takeout ZIP** opens the original Google Takeout ZIP.
- **Choose Takeout folder** reads the extracted Keep folder, including nested
  image folders. Choose ZIP instead if your browser cannot select folders.
- **Add JSON files and images** accepts multiple JSON files and supported PNG,
  JPEG, GIF and WebP pictures. You can select them together or add pictures after
  selecting JSON. Adding files keeps the current selection; choosing a folder
  or ZIP starts a new selection.

Selecting only JSON files does not give the app permission to read nearby images,
even when they are in the same folder on your computer. Missing image references
are listed before import. Add those pictures, use the complete folder/ZIP, or
explicitly select **Import anyway without missing images** for a partial import.
Attachment paths are matched first; a unique filename can also match images
selected individually. Ambiguous filenames are reported rather than guessed.

If you already imported text-only copies, importing the complete notes adds new
copies with images; it does not modify the earlier notes. Review the old copies
before deleting them. Duplicate skipping compares image content as well as text.

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
- Supported image attachments: up to 12 MiB each. From **1.0.21**, a complete note
  can contain up to **128 MiB of encoded JSON**, including base64 image data.
  Large notes travel in 256 KiB chunks and are saved atomically as one note.
  Pictures are not resized, split into other notes or silently discarded.
- ZIP64, encrypted and multidisk archives are not supported directly. Extract
  them and select the Keep folder instead. Corrupt data, unsafe paths, mismatched
  sizes and failed CRC checks are rejected.

## Interruptions and notes needing attention

Update **both the server and your native client** to 1.0.21 or newer to use chunked
uploads. On web, refresh after updating the container. Import still needs a
reachable server; it does not upload offline.

Transient network/timeouts and selected proxy errors are retried up to five times
with backoff. The same operation identifiers are reused, so a lost reply after a
successful save does not create another copy, even with duplicate skipping off.
If retries are exhausted, leave the dialog open and use **Resume import** after
restoring the connection. Confirmed notes are not uploaded again. Selecting new
files or closing/reopening starts a new import; keep **Skip duplicate notes** on
when restarting to avoid copies of already saved notes.

A corrupt, unsupported or oversized individual note is listed under **Notes
needing attention**, and remaining notes continue. Download the import report to
find affected titles and reasons. Reduce oversized pictures or correct the source
files before trying again. **Retry failed notes** retries only unconfirmed notes
from the current selection; choosing corrected files starts a new selection.
Failed notes are not saved partially. Existing notes and successful earlier batches
remain intact.

Uploads use bounded, account-scoped temporary rows in the server database. An
unfinished upload expires one hour after activity; cleanup runs every minute and
at server startup. A user can reserve up to 128 MiB, with a 512 MiB shared staging
budget. Committing releases the chunk data. Server storage/memory for the final
note/image dataset is still required; the limits are not a promise that every
low-memory device can display arbitrary amounts of imported data.

Closing the dialog stops future preparation/uploads; a server request already
accepted may finish. Large previews show only the first 100 titles, but process
all ready notes. The synthetic regression covers 1,300 small notes, a large note
with two images, interrupted replies and a failed note followed by later notes.

## Ownership and sharing

Trashed notes are skipped. **Import only notes I own** is on by default; supply
the Google Keep account email when explicit ownership is present in the export.
Sharing restoration is off by default and is optional: it matches existing Glass
Keep accounts, reports unmatched users, and can grant editing access. Review the
dialog's warning before enabling it.

Imports add notes to the signed-in account; they do not replace the whole database.
Existing archived notes, attachments and earlier backups remain intact. Automatic
JSON exports are described in [the export guide](automatic-exports.md).
