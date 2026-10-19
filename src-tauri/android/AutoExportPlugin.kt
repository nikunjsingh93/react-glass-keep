package io.github.nikunjsingh93.glasskeep

import android.app.Activity
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
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
}

@TauriPlugin
class AutoExportPlugin(private val activity: Activity): Plugin(activity) {
    @Command
    fun save(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            invoke.reject("Automatic Downloads requires Android 10 or newer. Use Export ALL notes in Settings to save manually.")
            return
        }
        val args = invoke.parseArgs(ExportArgs::class.java)
        if (!Regex("glass-keep-notes-[A-Za-z0-9-]+\\.json").matches(args.filename)) {
            invoke.reject("Invalid export filename")
            return
        }
        val resolver = activity.contentResolver
        var uri: android.net.Uri? = null
        try {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, args.filename)
                put(MediaStore.Downloads.MIME_TYPE, "application/json")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Glass Keep")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw java.io.IOException("Could not create the export in Downloads")
            resolver.openOutputStream(uri, "w")?.use { stream ->
                stream.write(args.json.toByteArray(Charsets.UTF_8))
                stream.flush()
            } ?: throw java.io.IOException("Could not write the export")
            resolver.update(uri, ContentValues().apply {put(MediaStore.Downloads.IS_PENDING, 0)}, null, null)
            val result = JSObject()
            result.put("saved", true)
            invoke.resolve(result)
        } catch (error: Exception) {
            uri?.let {try {resolver.delete(it, null, null)} catch (_: Exception) {}}
            invoke.reject("Could not save JSON export: " + error.message)
        }
    }
}
