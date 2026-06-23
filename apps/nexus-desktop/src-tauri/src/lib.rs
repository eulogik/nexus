use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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

#[derive(Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct SessionConfig {
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize)]
pub struct CostBreakdown {
    pub total_cost: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub model: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn sessions_dir(app: &AppHandle) -> PathBuf {
    let resource_dir = app
        .path()
        .resource_dir()
        .ok()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    resource_dir.join(".nexus").join("sessions")
}

fn ensure_sessions_dir(app: &AppHandle) -> std::io::Result<()> {
    let dir = sessions_dir(app);
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(())
}

fn session_path(app: &AppHandle, id: &str) -> PathBuf {
    sessions_dir(app).join(format!("{}.json", id))
}

fn load_sessions_from_disk(app: &AppHandle) -> Vec<Session> {
    let dir = match app.path().resource_dir() {
        Ok(d) => d.join(".nexus").join("sessions"),
        Err(_) => return vec![],
    };
    if !dir.exists() {
        return vec![];
    }
    let mut sessions = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(session) = serde_json::from_str::<Session>(&content) {
                        sessions.push(session);
                    }
                }
            }
        }
    }
    sessions.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    sessions
}

fn load_messages_from_disk(app: &AppHandle, session_id: &str) -> Vec<Message> {
    let path = session_path(app, session_id);
    if !path.exists() {
        return vec![];
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    #[derive(Deserialize)]
    struct SessionFile {
        messages: Option<Vec<Message>>,
    }
    serde_json::from_str::<SessionFile>(&content)
        .ok()
        .and_then(|f| f.messages)
        .unwrap_or_default()
}

fn save_session_to_disk(app: &AppHandle, session: &Session, messages: &[Message]) -> std::io::Result<()> {
    ensure_sessions_dir(app)?;
    #[derive(Serialize)]
    struct SessionFile {
        #[serde(flatten)]
        session: Session,
        messages: Vec<Message>,
    }
    let file = SessionFile {
        session: session.clone(),
        messages: messages.to_vec(),
    };
    let json = serde_json::to_string_pretty(&file).unwrap_or_default();
    fs::write(session_path(app, &session.id), json)?;
    Ok(())
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
    Ok(load_sessions_from_disk(&app))
}

#[tauri::command]
async fn create_session(app: AppHandle, config: SessionConfig) -> Result<Session, String> {
    let session = Session {
        id: uuid::Uuid::new_v4().to_string(),
        name: config.name,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_session_to_disk(&app, &session, &[]).map_err(|e| format!("Failed to save session: {}", e))?;
    Ok(session)
}

#[tauri::command]
async fn delete_session(app: AppHandle, session_id: String) -> Result<(), String> {
    let path = session_path(&app, &session_id);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete session: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn get_session_messages(app: AppHandle, session_id: String) -> Result<Vec<Message>, String> {
    Ok(load_messages_from_disk(&app, &session_id))
}

#[tauri::command]
async fn send_message(
    app: AppHandle,
    session_id: String,
    content: String,
) -> Result<Message, String> {
    let mut messages = load_messages_from_disk(&app, &session_id);

    let user_msg = Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "user".to_string(),
        content: content.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    messages.push(user_msg.clone());

    let assistant_content = format!("Nexus received: \"{}\"", content);
    let assistant_msg = Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "assistant".to_string(),
        content: assistant_content,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    messages.push(assistant_msg.clone());

    let session = Session {
        id: session_id.clone(),
        name: "Session".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_session_to_disk(&app, &session, &messages).map_err(|e| format!("Failed to save: {}", e))?;

    Ok(assistant_msg)
}

#[tauri::command]
async fn get_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .ok()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    let config_path = resource_dir.join(".nexus").join("config.json");
    if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| format!("Read error: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))
    } else {
        Ok(serde_json::json!({
            "provider": "openrouter",
            "model": "auto",
            "approvalLevel": "ask",
            "maxIterations": 50,
            "gitEnabled": true,
        }))
    }
}

#[tauri::command]
async fn update_config(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .ok()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    let config_path = resource_dir.join(".nexus").join("config.json");

    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path).map_err(|e| format!("Read error: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?
    } else {
        serde_json::json!({})
    };

    let val: serde_json::Value = serde_json::from_str(&value).unwrap_or(serde_json::Value::String(value));
    config[key] = val;

    let dir = config_path.parent().unwrap();
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("Mkdir error: {}", e))?;
    }
    fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap_or_default())
        .map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_cost(app: AppHandle, session_id: String) -> Result<CostBreakdown, String> {
    let messages = load_messages_from_disk(&app, &session_id);
    let input_tokens: u64 = messages.iter().filter(|m| m.role == "user").count() as u64 * 100;
    let output_tokens: u64 = messages.iter().filter(|m| m.role == "assistant").count() as u64 * 200;
    Ok(CostBreakdown {
        total_cost: 0.0,
        input_tokens,
        output_tokens,
        model: "nexus-local".to_string(),
    })
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
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
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
            delete_session,
            get_session_messages,
            send_message,
            get_config,
            update_config,
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
