use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{redirect::Policy, Client, Method, Url};
use serde::Serialize;
use std::{collections::HashMap, time::Duration};
use tauri::Manager;

fn valid_export_filename(name: &str) -> bool {
    name.starts_with("glass-keep-notes-") && name.ends_with(".json") && name.len() < 160
        && name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.')
}

#[cfg(target_os = "android")]
struct AndroidExports(tauri::plugin::PluginHandle<tauri::Wry>);

#[tauri::command]
async fn save_auto_export(app: tauri::AppHandle, filename: String, json: String) -> Result<(), String> {
    if !valid_export_filename(&filename) || json.len() > 200 * 1024 * 1024 {
        return Err("Invalid export filename or backup exceeds 200 MB".into());
    }
    #[cfg(target_os = "android")]
    {
        #[derive(Serialize)]
        struct Args {filename: String, json: String}
        app.state::<AndroidExports>().0.run_mobile_plugin::<serde_json::Value>("save", Args {filename,json})
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let directory = app.path().download_dir().map_err(|e|e.to_string())?.join("Glass Keep");
        tauri::async_runtime::spawn_blocking(move || {
            use std::io::Write;
            std::fs::create_dir_all(&directory).map_err(|e|e.to_string())?;
            let path=directory.join(filename);
            let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|e.to_string())?;
            if let Err(error)=file.write_all(json.as_bytes()).and_then(|_|file.sync_all()) {
                drop(file);let _=std::fs::remove_file(path);return Err(error.to_string());
            }
            Ok(())
        }).await.map_err(|e|e.to_string())?
    }
}

#[derive(Serialize)]
struct ApiResponse { status: u16, headers: HashMap<String, String>, body: String }

fn endpoint(server: &str, path: &str) -> Result<Url, String> {
    let base = Url::parse(server).map_err(|_| "Invalid server address")?;
    if !matches!(base.scheme(), "http" | "https") || !base.username().is_empty() || base.password().is_some() || base.path() != "/" || base.query().is_some() || base.fragment().is_some() {
        return Err("Use the HTTP or HTTPS server origin only".into());
    }
    if !path.starts_with("/api/") || path.contains('\\') { return Err("Only Glass Keep API requests are supported".into()); }
    let url = base.join(path).map_err(|_| "Invalid API path")?;
    if url.origin() != base.origin() || !url.path().starts_with("/api/") || url.fragment().is_some() { return Err("Invalid API destination".into()); }
    Ok(url)
}

#[tauri::command]
async fn api_request(server: String, path: String, method: String, headers: HashMap<String,String>, body: Option<String>) -> Result<ApiResponse,String> {
    let url = endpoint(&server, &path)?;
    let method = Method::from_bytes(method.as_bytes()).map_err(|_| "Invalid request method")?;
    if !matches!(method, Method::GET | Method::POST | Method::PUT | Method::PATCH | Method::DELETE) { return Err("Unsupported request method".into()); }
    if body.as_ref().is_some_and(|value| value.len() > 20 * 1024 * 1024) { return Err("Request exceeds the 20 MB limit".into()); }
    let client = Client::builder().redirect(Policy::none()).timeout(Duration::from_secs(120)).build().map_err(|_| "Could not initialize secure networking")?;
    let mut request = client.request(method, url);
    for (name, value) in headers {
        if matches!(name.to_ascii_lowercase().as_str(), "authorization" | "content-type" | "x-operation-id") { request = request.header(name, value); }
    }
    if let Some(value) = body { request = request.body(value); }
    let mut response = request.send().await.map_err(|_| "Could not reach the server. Check the address, connection and HTTPS certificate.")?;
    if response.status().is_redirection() { return Err("Server redirected the API request. Enter its final public address instead.".into()); }
    let status = response.status().as_u16();
    let headers = response.headers().iter().filter_map(|(key,value)| value.to_str().ok().map(|v|(key.to_string(),v.to_string()))).collect();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Server response was interrupted")? {
        if bytes.len() + chunk.len() > 210 * 1024 * 1024 { return Err("Server response exceeds the 210 MB limit".into()); }
        bytes.extend_from_slice(&chunk);
    }
    Ok(ApiResponse {status, headers, body: STANDARD.encode(bytes)})
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri::plugin::Builder::new("auto-export").setup(|app, api| {
            #[cfg(target_os = "android")]
            app.manage(AndroidExports(api.register_android_plugin("io.github.nikunjsingh93.glasskeep", "AutoExportPlugin")?));
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        }).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![api_request,save_auto_export])
        .run(tauri::generate_context!())
        .expect("Could not start Glass Keep");
}

#[cfg(test)]
mod tests {
    use super::endpoint;
    #[test]
    fn exports_only_accept_timestamped_json_names() {
        assert!(super::valid_export_filename("glass-keep-notes-1-2026-10-18T12-00-00-000Z.json"));
        for name in ["../notes.json", "glass-keep-notes-../secret.json", "C:\\notes.json", "glass-keep-notes-one.txt"] {
            assert!(!super::valid_export_filename(name));
        }
    }
    #[test]
    fn api_requests_cannot_escape_the_selected_origin() {
        assert!(endpoint("https://keep.example.com", "/api/health").is_ok());
        for path in ["//evil.example/api/login", "/api/../private", "/api/%2e%2e/private", "/api/\\evil", "/api/health#fragment"] { assert!(endpoint("https://keep.example.com", path).is_err(), "{path}"); }
        assert!(endpoint("https://user:password@keep.example.com", "/api/login").is_err());
    }
}
