use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
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
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
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

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize)]
pub struct CostBreakdown {
    pub total_cost: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub model: String,
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn nexus_dir() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".nexus")
}

fn projects_dir() -> PathBuf {
    nexus_dir().join("projects")
}

fn project_file(id: &str) -> PathBuf {
    projects_dir().join(format!("{}.json", id))
}

fn project_dir(id: &str) -> PathBuf {
    projects_dir().join(id)
}

fn sessions_dir(id: &str) -> PathBuf {
    project_dir(id).join("sessions")
}

fn session_path(proj_id: &str, sess_id: &str) -> PathBuf {
    sessions_dir(proj_id).join(format!("{}.json", sess_id))
}

fn ensure_dir(path: &PathBuf) -> std::io::Result<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

fn load_projects() -> Vec<Project> {
    let dir = projects_dir();
    if !dir.exists() {
        return vec![];
    }
    let mut projects = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(p) = serde_json::from_str::<Project>(&content) {
                        projects.push(p);
                    }
                }
            }
        }
    }
    projects.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    projects
}

fn save_project(project: &Project) -> std::io::Result<()> {
    ensure_dir(&projects_dir())?;
    let json = serde_json::to_string_pretty(project).unwrap_or_default();
    fs::write(project_file(&project.id), json)?;
    // Create project sessions directory
    ensure_dir(&sessions_dir(&project.id))?;
    Ok(())
}

fn delete_project_file(id: &str) -> std::io::Result<()> {
    let pf = project_file(id);
    if pf.exists() {
        fs::remove_file(&pf)?;
    }
    let pd = project_dir(id);
    if pd.exists() {
        fs::remove_dir_all(&pd)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Session helpers (scoped to a project)
// ---------------------------------------------------------------------------

fn load_sessions(proj_id: &str) -> Vec<Session> {
    let dir = sessions_dir(proj_id);
    if !dir.exists() {
        return vec![];
    }
    let mut sessions = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(s) = serde_json::from_str::<Session>(&content) {
                        sessions.push(s);
                    }
                }
            }
        }
    }
    sessions.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    sessions
}

fn load_messages(proj_id: &str, sess_id: &str) -> Vec<Message> {
    let path = session_path(proj_id, sess_id);
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

fn save_session(proj_id: &str, session: &Session, messages: &[Message]) -> std::io::Result<()> {
    ensure_dir(&sessions_dir(proj_id))?;
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
    fs::write(session_path(proj_id, &session.id), json)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

fn config_path() -> PathBuf {
    nexus_dir().join("config.json")
}

fn read_config() -> serde_json::Value {
    let cp = config_path();
    if let Ok(content) = fs::read_to_string(&cp) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
            return config;
        }
    }
    let mut def = serde_json::json!({});
    if let Ok(key) = std::env::var("NEXUS_OPENROUTER_API_KEY") {
        def["apiKey"] = serde_json::Value::String(key);
    }
    def
}

// ---------------------------------------------------------------------------
// LLM Bridge
// ---------------------------------------------------------------------------

async fn call_bridge_chat(
    proj_id: &str,
    sess_id: &str,
    content: &str,
) -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("cwd error: {}", e))?;
    let config = read_config();
    let api_key = config["apiKey"].as_str().unwrap_or("").to_string();

    if api_key.is_empty() {
        return Err("No API key configured.".to_string());
    }

    let sp = session_path(proj_id, sess_id);
    let mut messages =
        vec![serde_json::json!({"role": "system", "content": "You are Nexus, a helpful coding assistant."})];

    if sp.exists() {
        if let Ok(data) = fs::read_to_string(&sp) {
            if let Ok(sf) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(msgs) = sf["messages"].as_array() {
                    for m in msgs {
                        if let (Some(role), Some(c)) = (m["role"].as_str(), m["content"].as_str())
                        {
                            messages.push(serde_json::json!({"role": role, "content": c}));
                        }
                    }
                }
            }
        }
    }

    messages.push(serde_json::json!({"role": "user", "content": content}));

    let model = config["model"].as_str().unwrap_or("auto");
    let request = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
    });

    let esc_body = serde_json::to_string(&request).map_err(|e| format!("JSON error: {}", e))?;
    let esc_key = serde_json::to_string(&api_key).map_err(|e| format!("JSON error: {}", e))?;

    let js_code = format!(
        r#"const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {{
  method: 'POST',
  headers: {{ 'Authorization': 'Bearer ' + {key}, 'Content-Type': 'application/json' }},
  body: {body}
}});
if (!r.ok) {{ const t = await r.text(); throw new Error(r.status + ' ' + t); }}
const j = await r.json();
process.stdout.write(j.choices[0].message.content || '');"#,
        key = esc_key,
        body = esc_body
    );

    let output = Command::new("node")
        .args(["--input-type=module", "-e", &js_code])
        .current_dir(&cwd)
        .output()
        .await
        .map_err(|e| format!("Failed to run node: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Node error: {}", stderr.trim()))
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands
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
    Ok(AppInfo { version, platform, node_version })
}

// ── Projects ──

#[tauri::command]
async fn list_projects() -> Result<Vec<Project>, String> {
    Ok(load_projects())
}

#[tauri::command]
async fn add_project(path: String) -> Result<Project, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Untitled".to_string());

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_project(&project).map_err(|e| format!("Failed to save project: {}", e))?;
    Ok(project)
}

#[tauri::command]
async fn remove_project(id: String) -> Result<(), String> {
    delete_project_file(&id).map_err(|e| format!("Failed to remove project: {}", e))
}

#[tauri::command]
async fn get_project(id: String) -> Result<Project, String> {
    let pf = project_file(&id);
    let content = fs::read_to_string(&pf).map_err(|e| format!("Project not found: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))
}

// ── Sessions (scoped to project) ──

#[tauri::command]
async fn list_sessions(project_id: String) -> Result<Vec<Session>, String> {
    Ok(load_sessions(&project_id))
}

#[tauri::command]
async fn create_session(project_id: String, config: SessionConfig) -> Result<Session, String> {
    let session = Session {
        id: uuid::Uuid::new_v4().to_string(),
        name: config.name,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_session(&project_id, &session, &[])
        .map_err(|e| format!("Failed to save session: {}", e))?;
    Ok(session)
}

#[tauri::command]
async fn delete_session(project_id: String, session_id: String) -> Result<(), String> {
    let sp = session_path(&project_id, &session_id);
    if sp.exists() {
        fs::remove_file(&sp).map_err(|e| format!("Failed to delete session: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn get_session_messages(
    project_id: String,
    session_id: String,
) -> Result<Vec<Message>, String> {
    Ok(load_messages(&project_id, &session_id))
}

#[tauri::command]
async fn send_message(
    project_id: String,
    session_id: String,
    content: String,
) -> Result<Message, String> {
    let mut messages = load_messages(&project_id, &session_id);

    let user_msg = Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "user".to_string(),
        content: content.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    messages.push(user_msg.clone());

    let assistant_content = match call_bridge_chat(&project_id, &session_id, &content).await {
        Ok(resp) => resp,
        Err(e) => {
            format!("_{}_", e)
        }
    };

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
    save_session(&project_id, &session, &messages)
        .map_err(|e| format!("Failed to save: {}", e))?;

    Ok(assistant_msg)
}

// ── Project files (scoped to project path) ──

#[tauri::command]
async fn list_project_files(project_id: String, dir: String) -> Result<Vec<FileEntry>, String> {
    // First get the project path
    let pf = project_file(&project_id);
    let content = fs::read_to_string(&pf).map_err(|e| format!("Project not found: {}", e))?;
    let project: Project =
        serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?;

    let project_root = PathBuf::from(&project.path);
    let base = if dir.is_empty() {
        project_root.clone()
    } else {
        let d = PathBuf::from(&dir);
        if d.is_absolute() {
            d
        } else {
            project_root.join(&dir)
        }
    };

    if !base.exists() {
        return Ok(vec![]);
    }

    let ignore_dirs = [
        ".git", "node_modules", "target", ".nexus", "dist", ".turbo", "coverage", ".next",
    ];

    let mut entries = Vec::new();
    let read_dir = match fs::read_dir(&base) {
        Ok(d) => d,
        Err(_) => return Ok(entries),
    };

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || ignore_dirs.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let fe = FileEntry {
            name,
            path,
            is_dir,
            size,
        };
        if is_dir {
            dirs.push(fe);
        } else {
            files.push(fe);
        }
    }

    dirs.sort_by(|a, b| a.name.cmp(&b.name));
    files.sort_by(|a, b| a.name.cmp(&b.name));
    entries.extend(dirs);
    entries.extend(files);

    Ok(entries)
}

#[tauri::command]
async fn read_project_file(project_id: String, file_path: String) -> Result<String, String> {
    // Verify the file is within the project
    let pf = project_file(&project_id);
    let content = fs::read_to_string(&pf).map_err(|e| format!("Project not found: {}", e))?;
    let project: Project =
        serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?;
    let project_root = PathBuf::from(&project.path).canonicalize().unwrap();
    let target = PathBuf::from(&file_path).canonicalize().map_err(|_| "Invalid path".to_string())?;
    if !target.starts_with(&project_root) {
        return Err("File is outside project directory".to_string());
    }
    let file_content =
        fs::read_to_string(&file_path).map_err(|e| format!("Read error: {}", e))?;
    Ok(file_content)
}

// ── Config ──

#[tauri::command]
async fn get_config() -> Result<serde_json::Value, String> {
    let cp = config_path();
    if cp.exists() {
        let content = fs::read_to_string(&cp).map_err(|e| format!("Read error: {}", e))?;
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
async fn update_config(key: String, value: String) -> Result<(), String> {
    let cp = config_path();
    let mut config: serde_json::Value = if cp.exists() {
        let content = fs::read_to_string(&cp).map_err(|e| format!("Read error: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?
    } else {
        serde_json::json!({})
    };

    let val: serde_json::Value =
        serde_json::from_str(&value).unwrap_or(serde_json::Value::String(value));
    config[key] = val;

    ensure_dir(&nexus_dir()).map_err(|e| format!("Mkdir error: {}", e))?;
    fs::write(&cp, serde_json::to_string_pretty(&config).unwrap_or_default())
        .map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_cost(project_id: String, session_id: String) -> Result<CostBreakdown, String> {
    let messages = load_messages(&project_id, &session_id);
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
async fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
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
    app.opener()
        .open_url(&url, None::<&str>)
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

#[tauri::command]
async fn get_full_project_diff(project_id: String) -> Result<String, String> {
    let pf = project_file(&project_id);
    let content = fs::read_to_string(&pf).map_err(|e| format!("Project not found: {}", e))?;
    let project: Project = serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))?;
    let output = Command::new("git")
        .arg("-C")
        .arg(&project.path)
        .arg("diff")
        .arg("HEAD")
        .output()
        .await
        .map_err(|e| format!("Failed to run git diff: {}", e))?;
    if output.status.success() {
        let out = String::from_utf8(output.stdout).map_err(|e| format!("UTF-8 error: {}", e))?;
        Ok(out.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.trim().is_empty() {
            Ok(String::new())
        } else {
            Err(format!("Git error: {}", stderr.trim()))
        }
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
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            list_projects,
            add_project,
            remove_project,
            get_project,
            create_session,
            list_sessions,
            delete_session,
            get_session_messages,
            send_message,
            get_config,
            update_config,
            get_cost,
            show_notification,
            open_url,
            get_file_diff,
            get_full_project_diff,
            list_project_files,
            read_project_file,
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
