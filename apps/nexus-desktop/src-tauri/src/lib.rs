use serde::{Deserialize, Serialize};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::ShellExt;
use tokio::process::Command;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct AppInfo {
    pub version: String,
    pub platform: String,
    pub node_version: String,
}

#[derive(Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct SessionConfig {
    pub name: String,
}

#[derive(Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Serialize)]
pub struct CostBreakdown {
    pub total_cost: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub model: String,
}

#[derive(Serialize)]
pub struct CommandError {
    pub message: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn run_node_script(app: &AppHandle, script: &str) -> Result<String, String> {
    let cwd = app
        .path()
        .resource_dir()
        .ok()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let output = Command::new("node")
        .arg("-e")
        .arg(script)
        .current_dir(&cwd)
        .output()
        .await
        .map_err(|e| format!("Failed to execute node: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map(|s| s.trim().to_string())
            .map_err(|e| format!("Invalid UTF-8 from node: {}", e))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Node script error: {}", stderr.trim()))
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn get_app_info() -> Result<AppInfo, String> {
    let version = env!("CARGO_PKG_VERSION").to_string();
    let platform = std::env::consts::OS.to_string();

    let node_version = Command::new("node")
        .arg("--version")
        .output()
        .await
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string());

    Ok(AppInfo {
        version,
        platform,
        node_version,
    })
}

#[tauri::command]
async fn get_sessions(app: AppHandle) -> Result<Vec<Session>, String> {
    let script = r#"
        const sdk = require('nexus-sdk');
        sdk.sessions.list().then(s => console.log(JSON.stringify(s)));
    "#;

    let json = run_node_script(&app, script).await?;
    serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e))
}

#[tauri::command]
async fn create_session(app: AppHandle, config: SessionConfig) -> Result<Session, String> {
    let config_json =
        serde_json::to_string(&config).map_err(|e| format!("Serialization error: {}", e))?;

    let script = format!(
        r#"
        const sdk = require('nexus-sdk');
        sdk.sessions.create({}).then(s => console.log(JSON.stringify(s)));
        "#,
        config_json
    );

    let json = run_node_script(&app, &script).await?;
    serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e))
}

#[tauri::command]
async fn send_message(
    app: AppHandle,
    session_id: String,
    content: String,
) -> Result<Message, String> {
    let script = format!(
        r#"
        const sdk = require('nexus-sdk');
        const msg = {{ content: {:?} }};
        sdk.sessions.sendMessage({:?}, msg).then(m => console.log(JSON.stringify(m)));
        "#,
        content, session_id
    );

    let json = run_node_script(&app, &script).await?;
    serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e))
}

#[tauri::command]
async fn get_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let script = r#"
        const sdk = require('nexus-sdk');
        sdk.config.get().then(c => console.log(JSON.stringify(c)));
    "#;

    let json = run_node_script(&app, script).await?;
    serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e))
}

#[tauri::command]
async fn get_cost(app: AppHandle, session_id: String) -> Result<CostBreakdown, String> {
    let script = format!(
        r#"
        const sdk = require('nexus-sdk');
        sdk.sessions.getCost({:?}).then(c => console.log(JSON.stringify(c)));
        "#,
        session_id
    );

    let json = run_node_script(&app, &script).await?;
    serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e))
}

#[tauri::command]
async fn show_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("Notification error: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    app.shell()
        .open(&url, None)
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_file_diff(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .arg("diff")
        .arg(&path)
        .output()
        .await
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if output.status.success() {
        let out = String::from_utf8(output.stdout).map_err(|e| format!("UTF-8 error: {}", e))?;
        Ok(out.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Git error: {}", stderr.trim()))
    }
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show Nexus").build(app)?;
    let new_session = MenuItemBuilder::with_id("new_session", "New Session").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&new_session)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "new_session" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("new-session", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(app) = tray.app_handle() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_sessions,
            create_session,
            send_message,
            get_config,
            get_cost,
            show_notification,
            open_url,
            get_file_diff,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("Failed to build Tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
