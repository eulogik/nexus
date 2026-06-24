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
    if cfg!(target_os = "macos") {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Library/Application Support/nexus")
    } else if cfg!(target_os = "windows") {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("nexus")
    } else {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("nexus")
    }
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

fn load_session_meta(proj_id: &str, sess_id: &str) -> Session {
    let path = session_path(proj_id, sess_id);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(sf) = serde_json::from_str::<serde_json::Value>(&content) {
                return Session {
                    id: sf["id"].as_str().unwrap_or(sess_id).to_string(),
                    name: sf["name"].as_str().unwrap_or("Session").to_string(),
                    created_at: sf["created_at"].as_str().unwrap_or("").to_string(),
                };
            }
        }
    }
    Session {
        id: sess_id.to_string(),
        name: "Session".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
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
// Project context for LLM
// ---------------------------------------------------------------------------

fn collect_project_context(project_path: &str) -> String {
    let mut context = String::new();
    context.push_str(&format!("## Project Directory\n{}\n\n", project_path));

    // Try to read README
    let readme_paths = ["README.md", "README", "readme.md", "README.txt"];
    for readme in &readme_paths {
        let readme_path = PathBuf::from(project_path).join(readme);
        if let Ok(content) = fs::read_to_string(&readme_path) {
            let truncated = if content.len() > 3000 {
                format!("{}...(truncated)", &content[..3000])
            } else {
                content
            };
            context.push_str(&format!("## Project README ({})\n{}\n\n", readme, truncated));
            break;
        }
    }

    // Collect file tree (shallow, 2 levels)
    context.push_str("## Project Structure\n```\n");
    if let Ok(entries) = fs::read_dir(project_path) {
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
        for (i, entry) in entries.iter().enumerate() {
            if i >= 30 {
                context.push_str("... (truncated)\n");
                break;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') && name != ".nexus.md" {
                continue;
            }
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                context.push_str(&format!("{}/\n", name));
                // Show 1 level of children
                if let Ok(sub) = fs::read_dir(entry.path()) {
                    for (j, sub_entry) in sub.flatten().enumerate() {
                        if j >= 10 {
                            context.push_str("  ...\n");
                            break;
                        }
                        let sub_name = sub_entry.file_name().to_string_lossy().to_string();
                        if sub_name.starts_with('.') {
                            continue;
                        }
                        let sub_is_dir = sub_entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                        if sub_is_dir {
                            context.push_str(&format!("  {}/\n", sub_name));
                        } else {
                            context.push_str(&format!("  {}\n", sub_name));
                        }
                    }
                }
            } else {
                context.push_str(&format!("{}\n", name));
            }
        }
    }
    context.push_str("```\n");

    context
}

fn estimate_tokens(text: &str) -> usize {
    text.chars().count() / 4
}

fn compress_messages(messages: Vec<Message>, max_tokens: usize) -> Vec<Message> {
    if messages.is_empty() {
        return messages;
    }

    let system_msg = messages[0].clone();
    let mut other_messages: Vec<Message> = messages[1..].to_vec();

    let system_tokens = estimate_tokens(&system_msg.content);
    let budget = max_tokens.saturating_sub(system_tokens + 1000);

    if budget == 0 {
        return vec![system_msg];
    }

    let mut kept = Vec::new();
    let mut current_tokens = 0;

    while let Some(msg) = other_messages.pop() {
        let msg_tokens = estimate_tokens(&msg.content);
        if current_tokens + msg_tokens <= budget {
            current_tokens += msg_tokens;
            kept.push(msg);
        }
    }

    kept.reverse();

    if kept.len() < messages.len() - 1 {
        let summary = Message {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: system_msg.session_id.clone(),
            role: "user".to_string(),
            content: "[Previous conversation summary] Earlier messages were compressed to fit context window.".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
        let mut result = vec![system_msg];
        result.push(summary);
        result.extend(kept);
        result
    } else {
        let mut result = vec![system_msg];
        result.extend(kept);
        result
    }
}

// ---------------------------------------------------------------------------
// LLM Bridge
// ---------------------------------------------------------------------------
// LLM Bridge (external Node script using nexus-core AgentLoop)
// ---------------------------------------------------------------------------

async fn call_bridge_stream(
    app: &AppHandle,
    proj_id: &str,
    sess_id: &str,
    content: &str,
) -> Result<String, String> {
    let config = read_config();
    let api_key = config["apiKey"].as_str().unwrap_or("").to_string();

    if api_key.is_empty() {
        return Err("No API key configured.".to_string());
    }

    let project_path = {
        let pf = project_file(proj_id);
        if let Ok(data) = fs::read_to_string(&pf) {
            if let Ok(p) = serde_json::from_str::<Project>(&data) {
                p.path
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    };

    if project_path.is_empty() {
        return Err("Project not found".to_string());
    }

    let model = config["model"].as_str().unwrap_or("openai/gpt-4o-mini");
    let bridge_path = std::env::current_dir()
        .map_err(|e| format!("cwd error: {}", e))?
        .join("bridge.mjs");

    let args = serde_json::json!({
        "projectId": proj_id,
        "sessionId": sess_id,
        "projectPath": project_path,
        "content": content,
        "apiKey": api_key,
        "model": model,
    });

    let args_str = serde_json::to_string(&args)
        .map_err(|e| format!("JSON error: {}", e))?;

    let mut child = Command::new("node")
        .arg(&bridge_path)
        .arg(args_str)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn bridge: {}", e))?;

    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    use tokio::io::AsyncBufReadExt;
    let reader = tokio::io::BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut full_content = String::new();

    while let Ok(Some(line)) = lines.next_line().await {
        if line.starts_with('{') {
            if let Ok(evt) = serde_json::from_str::<serde_json::Value>(&line) {
                match evt["type"].as_str() {
                    Some("stream-token") => {
                        let token = evt["data"].as_str().unwrap_or("");
                        full_content.push_str(token);
                        let _ = app.emit("stream-token", token);
                    }
                    Some("approval-needed") => {
                        let _ = app.emit("approval-needed", &evt["data"]);
                    }
                    Some("stream-success") => {
                        let _ = app.emit("stream-done", &evt["data"]);
                    }
                    Some("stream-error") => {
                        let _ = app.emit("stream-error", &evt["data"]);
                    }
                    _ => {}
                }
            }
        } else if !line.is_empty() {
            full_content.push_str(&line);
            full_content.push('\n');
            let _ = app.emit("stream-token", &line);
        }
    }

    let status = child.wait().await.map_err(|e| format!("Wait error: {}", e))?;

    if !status.success() {
        let stderr = child.stderr.take()
            .map(|s| {
                let mut buf = String::new();
                use tokio::io::AsyncReadExt;
                let _ = tokio::io::BufReader::new(s).read_to_string(&mut buf);
                buf
            })
            .unwrap_or_default();
        if full_content.is_empty() {
            return Err(format!("Bridge error: {}", stderr.trim()));
        }
    }

    Ok(full_content)
}

#[tauri::command]
async fn send_message(
    app: AppHandle,
    project_id: String,
    session_id: String,
    content: String,
) -> Result<(), String> {
    let mut messages = load_messages(&project_id, &session_id);

    let user_msg = Message {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        role: "user".to_string(),
        content: content.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    messages.push(user_msg.clone());

    let session = load_session_meta(&project_id, &session_id);
    // Save user message immediately
    save_session(&project_id, &session, &messages)
        .map_err(|e| format!("Failed to save: {}", e))?;

    // Spawn streaming
    let app_clone = app.clone();
    let proj_id = project_id.clone();
    let sess_id = session_id.clone();
    let content_clone = content.clone();
    let session_clone = session;

    tokio::spawn(async move {
        match call_bridge_stream(&app_clone, &proj_id, &sess_id, &content_clone).await {
            Ok(_full_content) => {
                let _ = app_clone.emit("stream-done", &true);
            }
            Err(e) => {
                let _ = app_clone.emit("stream-error", &e);
            }
        }
    });

    Ok(())
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

    // Auto-create first session
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = Session {
        id: session_id.clone(),
        name: "Session 1".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    save_session(&project.id, &session, &[])
        .map_err(|e| format!("Failed to create session: {}", e))?;

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
async fn save_settings(api_key: String, model: String, approval_level: String, max_iterations: i32) -> Result<(), String> {
    let cp = config_path();
    let mut config: serde_json::Value = if cp.exists() {
        match fs::read_to_string(&cp) {
            Ok(c) => serde_json::from_str(&c).unwrap_or(serde_json::json!({})),
            Err(_) => serde_json::json!({}),
        }
    } else {
        serde_json::json!({})
    };
    config["apiKey"] = serde_json::Value::String(api_key);
    config["model"] = serde_json::Value::String(model);
    config["approvalLevel"] = serde_json::Value::String(approval_level);
    config["maxIterations"] = serde_json::Value::Number(serde_json::Number::from(max_iterations));
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
            save_settings,
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
