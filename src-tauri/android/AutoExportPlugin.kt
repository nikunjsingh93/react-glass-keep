package io.github.nikunjsingh93.glasskeep

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class ExportArgs {
    lateinit var filename: String
    lateinit var json: String
    var directory: String? = null
}

@TauriPlugin
class AutoExportPlugin(private val activity: Activity): Plugin(activity) {
    @Command
    fun chooseFolder(invoke: Invoke) {
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
            }
            startActivityForResult(invoke, intent, "folderResult")
        } catch (error: Exception) {invoke.reject("Could not open the folder picker: " + error.message)}
    }

    @ActivityCallback
    fun folderResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {invoke.resolve(JSObject());return}
        try {
            val data = result.data ?: throw java.io.IOException("No folder was selected")
            val uri = data.data ?: throw java.io.IOException("No folder was selected")
            val flags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            activity.contentResolver.takePersistableUriPermission(uri, flags)
            val response = JSObject()
            response.put("directory", uri.toString())
            response.put("name", DocumentsContract.getTreeDocumentId(uri).substringAfter(':').ifBlank {"Selected Android folder"})
            invoke.resolve(response)
        } catch (error: Exception) {invoke.reject("Could not remember folder access: " + error.message)}
    }

    @Command
    fun save(invoke: Invoke) {
        Thread {saveFile(invoke)}.start()
    }

    private fun saveFile(invoke: Invoke) {
        val args = invoke.parseArgs(ExportArgs::class.java)
        if (!Regex("glass-keep-notes-[A-Za-z0-9-]+\\.json").matches(args.filename)) {
            invoke.reject("Invalid export filename")
            return
        }
        val resolver = activity.contentResolver
        var uri: android.net.Uri? = null
        try {
            if (args.directory != null) {
                val tree = android.net.Uri.parse(args.directory)
                if (!resolver.persistedUriPermissions.any {it.uri == tree && it.isWritePermission}) {
                    throw java.io.IOException("Folder access was removed. Choose the export folder again.")
                }
                val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
                uri = DocumentsContract.createDocument(resolver, parent, "application/json", args.filename)
                    ?: throw java.io.IOException("Could not create an export in the selected folder")
            } else {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                throw java.io.IOException("Choose an export folder to enable automatic saving on this Android version.")
            }
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, args.filename)
                put(MediaStore.Downloads.MIME_TYPE, "application/json")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Glass Keep")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw java.io.IOException("Could not create the export in Downloads")
            }
            val destination = uri ?: throw java.io.IOException("No export destination")
            resolver.openOutputStream(destination, "w")?.use { stream ->
                stream.write(args.json.toByteArray(Charsets.UTF_8))
                stream.flush()
            } ?: throw java.io.IOException("Could not write the export")
            if (args.directory == null) resolver.update(destination, ContentValues().apply {put(MediaStore.Downloads.IS_PENDING, 0)}, null, null)
            val result = JSObject()
            result.put("saved", true)
            invoke.resolve(result)
        } catch (error: Exception) {
            uri?.let {try {if(args.directory != null) DocumentsContract.deleteDocument(resolver, it) else resolver.delete(it, null, null)} catch (_: Exception) {}}
            invoke.reject("Could not save JSON export: " + error.message)
        }
    }
}
