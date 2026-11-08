# Updating Glass Keep

The version below the logo on the main screen is the version of the interface
you are using. Click it to return to this guide. On native apps it is the client
version; update the server and installed clients separately.

## Docker / Portainer server

1. Export your notes and keep a backup of the server's existing data volume.
2. Check the [Latest release](https://github.com/nikunjsingh93/react-glass-keep/releases/latest)
   for changes and any update requirements.
3. In Portainer, use `nikunjsingh/glass-keep:latest` or the specific release tag.
   Pull the new image and recreate/redeploy your existing container or stack.
   Keep its data volume, port mappings and environment settings.
4. Open Glass Keep and refresh the page. If the version below the logo is still
   old, close other Glass Keep tabs and reopen the page or perform a hard refresh.

Recreating the container with the same data volume preserves the database and
attachments. Deleting or replacing that volume removes your stored data.

## Windows, macOS and Android clients

Download the matching client from the
[Latest release](https://github.com/nikunjsingh93/react-glass-keep/releases/latest).
Close the app and install the update, or replace your portable Windows executable.
Android release APKs retain their signing identity so they can update the installed
app. Keep your existing app profile to retain server settings and pending offline
edits. Reopen and confirm the version below the logo.

Clients connect to your hosted Glass Keep server; they require a server to sync.
Installing a client update does not update the Docker server.
