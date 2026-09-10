use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::{header::COOKIE, HeaderValue}, Message};

struct ManagedProcess {
    child: Child,
    pid: u32,
}

struct OwnedSwarmProcess(Mutex<Option<ManagedProcess>>);

#[derive(Clone, Serialize)]
struct LogPayload {
    source: String,
    level: String,
    message: String,
}

#[derive(Clone, Serialize)]
struct GenerationPayload {
    request_id: String,
    payload: serde_json::Value,
}

#[derive(Serialize)]
struct ProcessStatus {
    owned: bool,
    running: bool,
    pid: Option<u32>,
}

#[derive(Clone, Serialize)]
struct RepoRefOption {
    value: String,
    label: String,
    kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoStatus {
    path: String,
    branch: String,
    commit: String,
    describe: String,
    dirty: bool,
    origin: String,
    default_branch: String,
    launch_auto_pull: Option<bool>,
    refs: Vec<RepoRefOption>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StudioUpdateStatus {
    supported: bool,
    available: bool,
    can_apply: bool,
    dirty: bool,
    repo_path: String,
    current_version: String,
    latest_version: String,
    current_commit: String,
    latest_commit: String,
    commits_behind: u32,
    branch: String,
    origin: String,
    message: String,
    highlights: Vec<String>,
}

fn runner_log_path() -> Option<PathBuf> {
    std::env::var("SWARM_STUDIO_RUNNER_LOG")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
}

fn append_runner_log(line: &str) {
    let Some(path) = runner_log_path() else { return; };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

fn swarm_pid_file() -> PathBuf {
    std::env::var("SWARM_STUDIO_SWARM_PID_FILE")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("swarm-studio-owned-swarm.pid"))
}

fn write_swarm_pid(pid: u32) {
    let _ = fs::write(swarm_pid_file(), pid.to_string());
}

fn clear_swarm_pid() {
    let _ = fs::remove_file(swarm_pid_file());
}

fn emit_log(app: &tauri::AppHandle, level: &str, message: impl Into<String>) {
    let message = message.into();
    append_runner_log(&format!("[Swarm] {message}"));
    match level {
        "error" => eprintln!("[Swarm] {message}"),
        _ => println!("[Swarm] {message}"),
    }
    let _ = app.emit(
        "swarm-log",
        LogPayload {
            source: "swarm".into(),
            level: level.into(),
            message,
        },
    );
}

#[tauri::command]
async fn http_post_json(url: String, body: String, auth_token: Option<String>) -> Result<String, String> {
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|error| format!("Invalid JSON request body: {error}"))?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|error| format!("Could not build HTTP client: {error}"))?;
    let mut request = client.post(url).json(&payload);
    if let Some(token) = auth_token.filter(|value| !value.trim().is_empty()) {
        request = request.header(reqwest::header::COOKIE, format!("swarm_token={}", token.trim()));
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Swarm request failed: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Could not read Swarm response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Swarm returned {status}: {}",
            text.chars().take(300).collect::<String>()
        ));
    }
    Ok(text)
}

async fn finish_websocket_in_background<S>(mut socket: tokio_tungstenite::WebSocketStream<S>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        let _ = tokio::time::timeout(Duration::from_secs(8), async {
            while let Some(message) = socket.next().await {
                match message {
                    Ok(Message::Close(frame)) => {
                        let _ = socket.send(Message::Close(frame)).await;
                        break;
                    }
                    Ok(Message::Ping(value)) => { let _ = socket.send(Message::Pong(value)).await; }
                    Ok(Message::Text(text)) => {
                        if serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|value| value.get("success").and_then(|flag| flag.as_bool())) == Some(true) { break; }
                    }
                    _ => {}
                }
            }
        }).await;
        let _ = socket.send(Message::Close(None)).await;
        let _ = socket.flush().await;
    });
}

#[tauri::command]
async fn websocket_json(
    app: tauri::AppHandle,
    url: String,
    body: String,
    request_id: String,
    expected_images: usize,
    auth_token: Option<String>,
) -> Result<(), String> {
    let mut request = url.clone().into_client_request()
        .map_err(|error| format!("Invalid Swarm WebSocket URL {url}: {error}"))?;
    if let Some(token) = auth_token.filter(|value| !value.trim().is_empty()) {
        let cookie = HeaderValue::from_str(&format!("swarm_token={}", token.trim()))
            .map_err(|error| format!("Invalid Swarm auth token header: {error}"))?;
        request.headers_mut().insert(COOKIE, cookie);
    }
    let (mut socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|error| format!("Could not connect to Swarm WebSocket {url}: {error}"))?;
    socket
        .send(Message::Text(body.into()))
        .await
        .map_err(|error| format!("Could not send Swarm WebSocket request: {error}"))?;

    let mut image_count = 0usize;
    let target = expected_images.max(1);
    loop {
        let next = if image_count >= target {
            // Give Swarm a tiny foreground grace window for final metadata/status events, then
            // hand the polite close handshake to the background. This preserves resolved seed
            // metadata without making the UI wait on the server's multi-second socket shutdown.
            match tokio::time::timeout(Duration::from_millis(350), socket.next()).await {
                Ok(value) => value,
                Err(_) => {
                    finish_websocket_in_background(socket).await;
                    return Ok(());
                }
            }
        } else {
            socket.next().await
        };
        let Some(message) = next else { break; };
        let message = message.map_err(|error| format!("Swarm WebSocket failed: {error}"))?;
        match message {
            Message::Text(text) => {
                let payload: serde_json::Value = serde_json::from_str(&text)
                    .map_err(|error| format!("Invalid Swarm WebSocket JSON: {error}"))?;
                if payload.get("image").is_some_and(|value| !value.is_null()) {
                    image_count += 1;
                }
                let success = payload.get("success").and_then(|value| value.as_bool()) == Some(true);
                app.emit(
                    "swarm-generation-event",
                    GenerationPayload {
                        request_id: request_id.clone(),
                        payload,
                    },
                )
                .map_err(|error| format!("Could not emit generation update: {error}"))?;
                if success {
                    let _ = socket.send(Message::Close(None)).await;
                    let _ = socket.flush().await;
                    let _ = tokio::time::timeout(Duration::from_secs(2), async {
                        while let Some(reply) = socket.next().await {
                            if matches!(reply, Ok(Message::Close(_))) { break; }
                        }
                    }).await;
                    break;
                }
            }
            Message::Binary(bytes) => {
                let text = String::from_utf8(bytes.to_vec())
                    .map_err(|error| format!("Invalid UTF-8 WebSocket message: {error}"))?;
                let payload: serde_json::Value = serde_json::from_str(&text)
                    .map_err(|error| format!("Invalid Swarm WebSocket JSON: {error}"))?;
                if payload.get("image").is_some_and(|value| !value.is_null()) {
                    image_count += 1;
                }
                let success = payload.get("success").and_then(|value| value.as_bool()) == Some(true);
                app.emit(
                    "swarm-generation-event",
                    GenerationPayload {
                        request_id: request_id.clone(),
                        payload,
                    },
                )
                .map_err(|error| format!("Could not emit generation update: {error}"))?;
                if success {
                    let _ = socket.send(Message::Close(None)).await;
                    let _ = socket.flush().await;
                    let _ = tokio::time::timeout(Duration::from_secs(2), async {
                        while let Some(reply) = socket.next().await {
                            if matches!(reply, Ok(Message::Close(_))) { break; }
                        }
                    }).await;
                    break;
                }
            }
            Message::Close(frame) => {
                let _ = socket.send(Message::Close(frame)).await;
                let _ = socket.flush().await;
                break;
            }
            Message::Ping(value) => {
                socket
                    .send(Message::Pong(value))
                    .await
                    .map_err(|error| format!("Could not answer Swarm WebSocket ping: {error}"))?;
            }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
async fn http_get_data_url(url: String, auth_token: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut request = client.get(&url);
    if let Some(token) = auth_token.filter(|value| !value.trim().is_empty()) {
        request = request.header(reqwest::header::COOKIE, format!("swarm_token={}", token.trim()));
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not fetch image {url}: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Image request returned {status}."));
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read image bytes: {error}"))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[tauri::command]
async fn http_get_text(url: String, auth_token: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|error| format!("Could not build HTTP client: {error}"))?;
    let mut request = client.get(&url);
    if let Some(token) = auth_token.filter(|value| !value.trim().is_empty()) {
        request = request.header(reqwest::header::COOKIE, format!("swarm_token={}", token.trim()));
    }
    let response = request.send().await.map_err(|error| format!("Request failed: {error}"))?;
    let status = response.status();
    let text = response.text().await.map_err(|error| format!("Could not read response: {error}"))?;
    if !status.is_success() {
        return Err(format!("Request returned {status}: {}", text.chars().take(300).collect::<String>()));
    }
    Ok(text)
}

#[tauri::command]
async fn probe_url(url: String, auth_token: Option<String>) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_millis(700))
        .timeout(Duration::from_millis(1500))
        .build()
        .map_err(|error| format!("Could not build probe client: {error}"))?;
    let mut request = client.get(url);
    if let Some(token) = auth_token.filter(|value| !value.trim().is_empty()) {
        request = request.header(reqwest::header::COOKIE, format!("swarm_token={}", token.trim()));
    }
    match request.send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

fn discover_swarm_launcher(cwd: Option<&str>) -> Option<(String, Option<String>)> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(value) = cwd.filter(|value| !value.trim().is_empty()) {
        roots.push(PathBuf::from(value.trim()));
    }
    for key in ["SWARMUI_DIR", "SWARM_DIR", "SWARMUI_PATH"] {
        if let Ok(value) = std::env::var(key) {
            if !value.trim().is_empty() { roots.push(PathBuf::from(value.trim())); }
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let home = PathBuf::from(home);
        roots.push(home.join("SwarmUI"));
        roots.push(home.join("Documents").join("SwarmUI"));
        roots.push(home.join("Desktop").join("SwarmUI"));
    }
    #[cfg(target_os = "windows")]
    {
        roots.push(PathBuf::from(r"C:\SwarmUI"));
        roots.push(PathBuf::from(r"C:\AI\SwarmUI"));
    }
    if let Ok(current) = std::env::current_dir() {
        roots.push(current.clone());
        if let Some(parent) = current.parent() { roots.push(parent.to_path_buf()); }
    }
    let nested_roots: Vec<PathBuf> = roots.iter().map(|root| root.join("SwarmUI")).collect();
    roots.extend(nested_roots);

    #[cfg(target_os = "windows")]
    let launchers = ["launch-windows.bat", "launch-windows.cmd", "launch-windows.ps1", "SwarmUI.exe"];
    #[cfg(not(target_os = "windows"))]
    let launchers = ["launch-linux.sh", "launch.sh", "SwarmUI"];

    for root in roots {
        for launcher in launchers {
            let candidate = root.join(launcher);
            if candidate.is_file() {
                return Some((candidate.to_string_lossy().into_owned(), Some(root.to_string_lossy().into_owned())));
            }
        }
    }
    None
}

fn git_output(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .env("GIT_TERMINAL_PROMPT", "0")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|error| format!("Could not run git in {}: {error}", root.display()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(if stderr.is_empty() { format!("git {} exited with {}", args.join(" "), output.status) } else { stderr });
    }
    Ok(stdout)
}

fn git_succeeds(root: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .env("GIT_TERMINAL_PROMPT", "0")
        .arg("-C")
        .arg(root)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn find_git_root(path: &Path) -> Option<PathBuf> {
    let mut cursor = if path.is_file() { path.parent()?.to_path_buf() } else { path.to_path_buf() };
    loop {
        if cursor.join(".git").exists() { return Some(cursor); }
        if !cursor.pop() { break; }
    }
    None
}

fn is_studio_repo(root: &Path) -> bool {
    let package = root.join("package.json");
    let runner = root.join("start.ps1");
    if !package.is_file() || !runner.is_file() { return false; }
    let Ok(text) = fs::read_to_string(package) else { return false; };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| value.get("name").and_then(|item| item.as_str()).map(str::to_owned))
        .as_deref()
        == Some("swarm-studio-standalone")
}

fn resolve_studio_repo_root() -> Result<PathBuf, String> {
    let mut candidates = Vec::<PathBuf>::new();
    if let Ok(root) = std::env::var("SWARM_STUDIO_ROOT") {
        if !root.trim().is_empty() { candidates.push(PathBuf::from(root.trim())); }
    }
    if let Ok(current) = std::env::current_dir() { candidates.push(current); }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(parent) = manifest.parent() { candidates.push(parent.to_path_buf()); }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() { candidates.push(parent.to_path_buf()); }
    }

    for candidate in candidates {
        if let Some(root) = find_git_root(&candidate) {
            if is_studio_repo(&root) { return Ok(root); }
        }
    }
    Err("This copy of Swarm Studio is not running from a Git checkout. The source updater is available after cloning the repository once.".into())
}

fn remote_package_version(root: &Path, remote_ref: &str) -> String {
    let spec = format!("{remote_ref}:package.json");
    let Ok(text) = git_output(root, &["show", &spec]) else { return String::new(); };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| value.get("version").and_then(|item| item.as_str()).map(str::to_owned))
        .unwrap_or_default()
}

fn unsupported_studio_update(message: impl Into<String>) -> StudioUpdateStatus {
    StudioUpdateStatus {
        supported: false,
        available: false,
        can_apply: false,
        dirty: false,
        repo_path: String::new(),
        current_version: env!("CARGO_PKG_VERSION").into(),
        latest_version: String::new(),
        current_commit: String::new(),
        latest_commit: String::new(),
        commits_behind: 0,
        branch: String::new(),
        origin: String::new(),
        message: message.into(),
        highlights: Vec::new(),
    }
}

fn studio_update_status(root: &Path, fetch: bool) -> Result<StudioUpdateStatus, String> {
    let origin = git_output(root, &["remote", "get-url", "origin"])
        .map_err(|_| "Studio's Git checkout has no usable 'origin' remote.".to_string())?;
    if fetch { git_output(root, &["fetch", "--tags", "--prune", "origin"])?; }
    let branch = default_remote_branch(root);
    let remote_ref = format!("origin/{branch}");
    git_output(root, &["rev-parse", "--verify", &remote_ref])?;

    let current_commit = git_output(root, &["rev-parse", "--short=12", "HEAD"])?;
    let latest_commit = git_output(root, &["rev-parse", "--short=12", &remote_ref])?;
    let dirty = !git_output(root, &["status", "--porcelain", "--untracked-files=normal"])
        .unwrap_or_default()
        .is_empty();
    let commits_behind = git_output(root, &["rev-list", "--count", &format!("HEAD..{remote_ref}")])
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    let fast_forward = git_succeeds(root, &["merge-base", "--is-ancestor", "HEAD", &remote_ref]);
    let available = commits_behind > 0 && current_commit != latest_commit;
    let can_apply = available && fast_forward && !dirty;
    let latest_version = remote_package_version(root, &remote_ref);
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let range = format!("HEAD..{remote_ref}");
    let highlights = git_output(root, &["log", "-n", "4", "--pretty=format:%s", &range])
        .unwrap_or_default()
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let message = if !available {
        "Swarm Studio is up to date.".to_string()
    } else if dirty {
        "An update is available, but local edits or untracked files block one-click updating. Commit, stash, or move them first.".to_string()
    } else if !fast_forward {
        "The local Studio checkout has diverged from origin, so the automatic updater will not rewrite it.".to_string()
    } else {
        format!("Swarm Studio {} is available.", if latest_version.is_empty() { latest_commit.as_str() } else { latest_version.as_str() })
    };

    Ok(StudioUpdateStatus {
        supported: true,
        available,
        can_apply,
        dirty,
        repo_path: root.to_string_lossy().into_owned(),
        current_version,
        latest_version,
        current_commit,
        latest_commit,
        commits_behind,
        branch,
        origin,
        message,
        highlights,
    })
}

fn resolve_repo_root(kind: &str, path_hint: Option<&str>) -> Result<PathBuf, String> {
    if let Some(hint) = path_hint.filter(|value| !value.trim().is_empty()) {
        let raw = PathBuf::from(hint.trim());
        let candidates = if raw.is_absolute() {
            vec![raw]
        } else {
            let mut values = vec![raw.clone()];
            if let Ok(current) = std::env::current_dir() { values.push(current.join(&raw)); }
            if kind == "comfy" {
                if let Some((_, Some(swarm_dir))) = discover_swarm_launcher(None) {
                    values.push(PathBuf::from(swarm_dir).join(&raw));
                }
            }
            values
        };
        for candidate in candidates {
            if let Some(root) = find_git_root(&candidate) { return Ok(root); }
        }
    }
    if kind == "swarm" {
        if let Some((launcher, cwd)) = discover_swarm_launcher(path_hint) {
            if let Some(root) = find_git_root(Path::new(&launcher)) { return Ok(root); }
            if let Some(cwd) = cwd.and_then(|value| find_git_root(Path::new(&value))) { return Ok(cwd); }
        }
    }
    Err(format!("Could not locate the {kind} git repository. Connect first or configure the local path."))
}

fn default_remote_branch(root: &Path) -> String {
    if let Ok(remote) = git_output(root, &["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]) {
        if let Some(branch) = remote.strip_prefix("origin/") { return branch.to_string(); }
    }
    if git_succeeds(root, &["show-ref", "--verify", "--quiet", "refs/remotes/origin/master"]) { return "master".into(); }
    if git_succeeds(root, &["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"]) { return "main".into(); }
    "master".into()
}

fn swarm_launch_auto_pull_marker(root: &Path) -> PathBuf {
    root.join("src").join("bin").join("always_pull")
}

fn set_swarm_launch_auto_pull(root: &Path, enabled: bool) -> Result<(), String> {
    let marker = swarm_launch_auto_pull_marker(root);
    if enabled {
        let parent = marker.parent().ok_or_else(|| "Could not resolve Swarm launch auto-pull marker directory.".to_string())?;
        fs::create_dir_all(parent).map_err(|error| format!("Could not prepare Swarm launch auto-pull marker directory: {error}"))?;
        fs::write(&marker, b"").map_err(|error| format!("Could not enable Swarm launch auto-pull: {error}"))?;
    } else if marker.exists() {
        fs::remove_file(&marker).map_err(|error| format!("Could not disable Swarm launch auto-pull: {error}"))?;
    }
    Ok(())
}

fn repo_status_for(root: &Path, kind: &str) -> Result<RepoStatus, String> {
    let branch = git_output(root, &["branch", "--show-current"]).unwrap_or_default();
    let commit = git_output(root, &["rev-parse", "--short=12", "HEAD"])?;
    let describe = git_output(root, &["describe", "--tags", "--always", "--dirty"]).unwrap_or_else(|_| commit.clone());
    let dirty = !git_output(root, &["status", "--porcelain", "--untracked-files=no"]).unwrap_or_default().is_empty();
    let origin = git_output(root, &["remote", "get-url", "origin"]).unwrap_or_default();
    let default_branch = default_remote_branch(root);
    let mut refs = Vec::new();

    if let Ok(tags) = git_output(root, &["tag", "--sort=-creatordate", "--format=%(refname:short)"]) {
        for tag in tags.lines().filter(|value| !value.trim().is_empty()).take(16) {
            refs.push(RepoRefOption { value: tag.into(), label: format!("tag · {tag}"), kind: "tag".into() });
        }
    }

    let history_target = format!("origin/{default_branch}");
    let log_target = if git_succeeds(root, &["rev-parse", "--verify", &history_target]) { history_target.as_str() } else { "HEAD" };
    if let Ok(log) = git_output(root, &["log", "-n", "24", "--date=short", "--pretty=format:%H%x09%ad%x09%s", log_target]) {
        for line in log.lines() {
            let mut parts = line.splitn(3, '\t');
            let Some(hash) = parts.next() else { continue; };
            let date = parts.next().unwrap_or("");
            let subject = parts.next().unwrap_or("");
            if hash.is_empty() { continue; }
            refs.push(RepoRefOption {
                value: hash.to_string(),
                label: format!("{date} · {} · {subject}", &hash[..hash.len().min(9)]),
                kind: "commit".into(),
            });
        }
    }

    if let Ok(branches) = git_output(root, &["branch", "-r", "--format=%(refname:short)"]) {
        for remote in branches.lines().filter(|value| !value.ends_with("/HEAD")).take(12) {
            refs.push(RepoRefOption { value: remote.into(), label: format!("branch · {remote}"), kind: "branch".into() });
        }
    }

    Ok(RepoStatus {
        path: root.to_string_lossy().into_owned(),
        branch,
        commit,
        describe,
        dirty,
        origin,
        default_branch,
        launch_auto_pull: if kind.eq_ignore_ascii_case("swarm") { Some(swarm_launch_auto_pull_marker(root).exists()) } else { None },
        refs,
    })
}

fn ensure_repo_clean(root: &Path) -> Result<(), String> {
    let dirty = !git_output(root, &["status", "--porcelain", "--untracked-files=no"]).unwrap_or_default().is_empty();
    if dirty {
        return Err(format!("Refusing to change versions because {} has tracked local changes. Commit/stash them first.", root.display()));
    }
    Ok(())
}

fn ensure_studio_repo_clean(root: &Path) -> Result<(), String> {
    let dirty = !git_output(root, &["status", "--porcelain", "--untracked-files=normal"]).unwrap_or_default().is_empty();
    if dirty {
        return Err(format!("Refusing to self-update because {} has local edits or untracked files. Commit, stash, or move them first.", root.display()));
    }
    Ok(())
}

#[tauri::command]
async fn studio_update_check() -> StudioUpdateStatus {
    match tauri::async_runtime::spawn_blocking(|| {
        let root = match resolve_studio_repo_root() {
            Ok(root) => root,
            Err(message) => return unsupported_studio_update(message),
        };
        studio_update_status(&root, true).unwrap_or_else(unsupported_studio_update)
    }).await {
        Ok(status) => status,
        Err(error) => unsupported_studio_update(format!("Studio update worker failed: {error}")),
    }
}

fn studio_update_apply_blocking(app: tauri::AppHandle) -> Result<String, String> {
    let root = resolve_studio_repo_root()?;
    ensure_studio_repo_clean(&root)?;
    let status = studio_update_status(&root, true)?;
    if !status.available { return Err("Swarm Studio is already up to date.".into()); }
    if !status.can_apply { return Err(status.message); }

    let root_text = root.to_string_lossy().replace('\'', "''");
    let branch_text = status.branch.replace('\'', "''");
    let app_pid = std::process::id();
    let helper_path = std::env::temp_dir().join(format!("swarm-studio-update-{app_pid}.ps1"));
    let script = r#"$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'
$Root = '__ROOT__'
$Branch = '__BRANCH__'
$Remote = "origin/$Branch"
$AppPid = __PID__
$Log = Join-Path $Root '.swarm-studio-update.log'
function Write-UpdateLog([string]$Message) {
    Add-Content -LiteralPath $Log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}
try {
    Write-UpdateLog "Updater started for PID $AppPid -> $Remote"
    $ParentPid = $null
    try { $ParentPid = (Get-CimInstance Win32_Process -Filter "ProcessId = $AppPid" -ErrorAction Stop).ParentProcessId } catch {}
    Wait-Process -Id $AppPid -ErrorAction SilentlyContinue
    if ($ParentPid) {
        $Deadline = (Get-Date).AddSeconds(15)
        while ((Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $Deadline) { Start-Sleep -Milliseconds 250 }
    }
    Start-Sleep -Milliseconds 1200
    Set-Location -LiteralPath $Root
    $Before = (& git rev-parse HEAD).Trim()
    & git fetch --tags --prune origin *>> $Log
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed with exit code $LASTEXITCODE" }
    & git show-ref --verify --quiet "refs/heads/$Branch"
    if ($LASTEXITCODE -eq 0) {
        & git checkout $Branch *>> $Log
    } else {
        & git checkout -b $Branch --track $Remote *>> $Log
    }
    if ($LASTEXITCODE -ne 0) { throw "git checkout failed with exit code $LASTEXITCODE" }
    & git merge --ff-only $Remote *>> $Log
    if ($LASTEXITCODE -ne 0) { throw "git fast-forward failed with exit code $LASTEXITCODE" }
    $RefreshDependencies = $false
    try {
        $BeforePackageText = (& git show "$Before`:package.json") -join "`n"
        $BeforePackage = $BeforePackageText | ConvertFrom-Json
        $AfterPackage = Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
        $BeforeDeps = [ordered]@{ dependencies = $BeforePackage.dependencies; devDependencies = $BeforePackage.devDependencies } | ConvertTo-Json -Compress -Depth 20
        $AfterDeps = [ordered]@{ dependencies = $AfterPackage.dependencies; devDependencies = $AfterPackage.devDependencies } | ConvertTo-Json -Compress -Depth 20
        $LockChanged = @(& git diff --name-only $Before HEAD -- package-lock.json).Count -gt 0
        $RefreshDependencies = ($BeforeDeps -ne $AfterDeps) -or $LockChanged
    } catch {
        Write-UpdateLog ('Could not compare dependency metadata; the normal runner dependency guard will remain in charge. ' + $_.Exception.Message)
    }
    $After = (& git rev-parse --short=12 HEAD).Trim()
    Write-UpdateLog "Update complete at $After; restarting Studio."
    $StartScript = Join-Path $Root 'start.ps1'
    $RestartArgs = @('-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $StartScript + '"'), '-NoShortcut')
    if ($RefreshDependencies) {
        Write-UpdateLog 'JavaScript dependency metadata changed; the restarted runner will refresh dependencies.'
        $RestartArgs += '-RefreshDependencies'
    }
    Start-Process -FilePath 'powershell.exe' -WorkingDirectory $Root -ArgumentList $RestartArgs
} catch {
    Write-UpdateLog ("UPDATE FAILED: " + $_.Exception.Message)
} finally {
    Start-Sleep -Milliseconds 250
    Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
}
"#
        .replace("__ROOT__", &root_text)
        .replace("__BRANCH__", &branch_text)
        .replace("__PID__", &app_pid.to_string());
    fs::write(&helper_path, script)
        .map_err(|error| format!("Could not prepare the Studio updater helper: {error}"))?;

    #[cfg(target_os = "windows")]
    {
        Command::new("powershell.exe")
            .args(["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File"])
            .arg(&helper_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("Could not launch the Studio updater helper: {error}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Err("The source updater currently supports the Windows start.ps1 distribution only.".into());
    }

    let exit_app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        exit_app.exit(0);
    });
    Ok(format!("Updating to {} and restarting Studio…", if status.latest_version.is_empty() { status.latest_commit } else { status.latest_version }))
}

#[tauri::command]
async fn studio_update_apply(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || studio_update_apply_blocking(app))
        .await
        .map_err(|error| format!("Studio update worker failed: {error}"))?
}

#[tauri::command]
fn backend_repo_status(kind: String, path_hint: Option<String>) -> Result<RepoStatus, String> {
    let kind = kind.trim().to_ascii_lowercase();
    let root = resolve_repo_root(&kind, path_hint.as_deref())?;
    repo_status_for(&root, &kind)
}

#[tauri::command]
fn backend_repo_fetch(kind: String, path_hint: Option<String>) -> Result<RepoStatus, String> {
    let kind = kind.trim().to_ascii_lowercase();
    let root = resolve_repo_root(&kind, path_hint.as_deref())?;
    git_output(&root, &["fetch", "--tags", "--prune", "origin"])?;
    repo_status_for(&root, &kind)
}

#[tauri::command]
fn backend_repo_switch(kind: String, path_hint: Option<String>, target: String) -> Result<RepoStatus, String> {
    let kind = kind.trim().to_ascii_lowercase();
    let root = resolve_repo_root(&kind, path_hint.as_deref())?;
    ensure_repo_clean(&root)?;
    let target = target.trim();
    if target.is_empty() || target.starts_with('-') || target.len() > 160 {
        return Err("Enter a tag, commit hash, or remote ref to pin.".into());
    }
    git_output(&root, &["fetch", "--tags", "--prune", "origin"])?;
    let commit_spec = format!("{target}^{{commit}}");
    git_output(&root, &["rev-parse", "--verify", &commit_spec])?;
    git_output(&root, &["checkout", "--detach", target])?;
    // Swarm's launch-windows.bat checks src/bin/always_pull before startup and runs git pull when
    // present. A version pin must therefore remove that marker or the next launch can undo the pin.
    if kind == "swarm" {
        set_swarm_launch_auto_pull(&root, false)?;
    }
    repo_status_for(&root, &kind)
}

#[tauri::command]
fn backend_repo_latest(kind: String, path_hint: Option<String>) -> Result<RepoStatus, String> {
    let kind = kind.trim().to_ascii_lowercase();
    let root = resolve_repo_root(&kind, path_hint.as_deref())?;
    ensure_repo_clean(&root)?;
    git_output(&root, &["fetch", "--tags", "--prune", "origin"])?;
    let branch = default_remote_branch(&root);
    let local_ref = format!("refs/heads/{branch}");
    let remote_ref = format!("origin/{branch}");
    if git_succeeds(&root, &["show-ref", "--verify", "--quiet", &local_ref]) {
        git_output(&root, &["checkout", &branch])?;
    } else {
        git_output(&root, &["checkout", "-b", &branch, "--track", &remote_ref])?;
    }
    git_output(&root, &["merge", "--ff-only", &remote_ref])?;
    repo_status_for(&root, &kind)
}

#[tauri::command]
fn swarm_repo_set_launch_auto_pull(path_hint: Option<String>, enabled: bool) -> Result<RepoStatus, String> {
    let root = resolve_repo_root("swarm", path_hint.as_deref())?;
    set_swarm_launch_auto_pull(&root, enabled)?;
    repo_status_for(&root, "swarm")
}

fn command_for_platform(command: &str, args: &[String]) -> Command {
    #[cfg(target_os = "windows")]
    {
        let trimmed = command.trim();
        let lowercase = trimmed.to_ascii_lowercase();
        if lowercase.ends_with(".bat") || lowercase.ends_with(".cmd") {
            let mut process = Command::new("cmd.exe");
            process.arg("/D").arg("/S").arg("/C").arg(trimmed).args(args);
            return process;
        }
        if lowercase.ends_with(".ps1") {
            let mut process = Command::new("powershell.exe");
            process.arg("-NoLogo").arg("-ExecutionPolicy").arg("Bypass").arg("-File").arg(trimmed).args(args);
            return process;
        }

        // A bare Windows launcher may be a PowerShell function/alias (eg. a user's Swarmima
        // function), not a real executable. Run it through the normal PowerShell profile so
        // Connect and Auto-start can launch the same command that works in the user's terminal.
        let looks_like_path = trimmed.contains('\\') || trimmed.contains('/') || lowercase.ends_with(".exe");
        if !looks_like_path {
            let mut expression = format!("& {{ {}", trimmed);
            for arg in args {
                expression.push(' ');
                expression.push('\'');
                expression.push_str(&arg.replace('\'', "''"));
                expression.push('\'');
            }
            expression.push_str(" }");
            let mut process = Command::new("powershell.exe");
            process.arg("-NoLogo").arg("-Command").arg(expression);
            return process;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if command.to_ascii_lowercase().ends_with(".sh") {
            let mut process = Command::new("sh");
            process.arg(command).args(args);
            return process;
        }
    }

    let mut process = Command::new(command);
    process.args(args);
    process
}

fn pipe_process_logs(app: tauri::AppHandle, child: &mut Child) {
    if let Some(stdout) = child.stdout.take() {
        let app_stdout = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) => emit_log(&app_stdout, "info", line),
                    Err(error) => {
                        emit_log(&app_stdout, "error", format!("Could not read Swarm stdout: {error}"));
                        break;
                    }
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                match line {
                    Ok(line) => emit_log(&app, "error", line),
                    Err(error) => {
                        emit_log(&app, "error", format!("Could not read Swarm stderr: {error}"));
                        break;
                    }
                }
            }
        });
    }
}

#[tauri::command]
fn start_swarm(
    app: tauri::AppHandle,
    state: tauri::State<'_, OwnedSwarmProcess>,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<String, String> {
    let (resolved_command, discovered_cwd) = if command.trim().is_empty() {
        discover_swarm_launcher(cwd.as_deref()).ok_or_else(|| "No Swarm launch command is configured and Studio could not discover a SwarmUI launcher. Set one under Settings → Connection → Launch method (a .bat/.ps1/.exe path or PowerShell function/alias).".to_string())?
    } else {
        (command.trim().to_string(), None)
    };

    let mut owned = state
        .0
        .lock()
        .map_err(|_| "Process lock was poisoned.".to_string())?;
    if let Some(managed) = owned.as_mut() {
        match managed.child.try_wait() {
            Ok(None) => return Ok(format!("Studio already owns Swarm process {}.", managed.pid)),
            Ok(Some(status)) => {
                emit_log(&app, "warn", format!("Previous Swarm launcher exited with {status}."));
                *owned = None;
            }
            Err(error) => return Err(format!("Could not inspect owned Swarm process: {error}")),
        }
    }

    let mut process = command_for_platform(&resolved_command, &args);
    if let Some(directory) = cwd.filter(|value| !value.trim().is_empty()).or(discovered_cwd) {
        process.current_dir(directory);
    }
    process
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = process
        .spawn()
        .map_err(|error| format!("Could not launch SwarmUI: {error}"))?;
    let pid = child.id();
    pipe_process_logs(app.clone(), &mut child);
    *owned = Some(ManagedProcess { child, pid });
    write_swarm_pid(pid);
    emit_log(&app, "info", format!("Launched SwarmUI as process {pid}."));
    Ok(format!("Launched SwarmUI as process {pid}."))
}

#[tauri::command]
fn open_swarm_system(
    app: tauri::AppHandle,
    command: String,
    args: Vec<String>,
) -> Result<String, String> {
    if command.trim().is_empty() {
        return Err("No Swarm launcher is configured. Set one under Settings → Connection → Launch method.".into());
    }
    #[cfg(target_os = "windows")]
    {
        let trimmed = command.trim();
        let looks_like_path = trimmed.contains('\\')
            || trimmed.contains('/')
            || [".bat", ".cmd", ".ps1", ".exe"]
                .iter()
                .any(|extension| trimmed.to_ascii_lowercase().ends_with(extension));
        let escaped_command = trimmed.replace('\'', "''");
        let mut expression = if looks_like_path {
            format!("& '{escaped_command}'")
        } else {
            trimmed.to_string()
        };
        for arg in args {
            expression.push(' ');
            expression.push('\'');
            expression.push_str(&arg.replace('\'', "''"));
            expression.push('\'');
        }
        Command::new("powershell.exe")
            .arg("-NoLogo")
            .arg("-NoExit")
            .arg("-Command")
            .arg(expression)
            .stdin(Stdio::null())
            .spawn()
            .map_err(|error| format!("Could not open Swarm with PowerShell: {error}"))?;
        let message = "Opened the Swarm command in your normal PowerShell environment. Studio does not own or capture this process.";
        emit_log(&app, "info", message);
        return Ok(message.into());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut process = command_for_platform(command.trim(), &args);
        process.spawn().map_err(|error| format!("Could not open Swarm launcher: {error}"))?;
        let message = "Opened the Swarm launcher as an external process. Studio does not own it.";
        emit_log(&app, "info", message);
        Ok(message.into())
    }
}

#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) -> Result<(), String> {
    let pid_string = pid.to_string();
    let status = Command::new("taskkill")
        .args(["/PID", pid_string.as_str(), "/T", "/F"])
        .status()
        .map_err(|error| format!("Could not run taskkill: {error}"))?;
    if !status.success() {
        return Err(format!("taskkill exited with {status}."));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(_pid: u32) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn stop_swarm(
    app: tauri::AppHandle,
    state: tauri::State<'_, OwnedSwarmProcess>,
) -> Result<String, String> {
    let mut owned = state
        .0
        .lock()
        .map_err(|_| "Process lock was poisoned.".to_string())?;
    let Some(mut managed) = owned.take() else {
        return Ok("Studio does not own a running SwarmUI process.".into());
    };
    let pid = managed.pid;

    #[cfg(target_os = "windows")]
    {
        kill_process_tree(pid)?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        managed
            .child
            .kill()
            .map_err(|error| format!("Could not stop SwarmUI process {pid}: {error}"))?;
    }

    let _ = managed.child.wait();
    clear_swarm_pid();
    emit_log(&app, "info", format!("Stopped Studio-owned SwarmUI process tree {pid}."));
    Ok(format!("Stopped Studio-owned SwarmUI process tree {pid}."))
}

#[tauri::command]
fn swarm_process_status(
    state: tauri::State<'_, OwnedSwarmProcess>,
) -> Result<ProcessStatus, String> {
    let mut owned = state
        .0
        .lock()
        .map_err(|_| "Process lock was poisoned.".to_string())?;
    let Some(managed) = owned.as_mut() else {
        clear_swarm_pid();
        return Ok(ProcessStatus {
            owned: false,
            running: false,
            pid: None,
        });
    };
    match managed.child.try_wait() {
        Ok(None) => Ok(ProcessStatus {
            owned: true,
            running: true,
            pid: Some(managed.pid),
        }),
        Ok(Some(_)) => {
            *owned = None;
            clear_swarm_pid();
            Ok(ProcessStatus {
                owned: false,
                running: false,
                pid: None,
            })
        }
        Err(error) => Err(format!("Could not inspect Swarm process: {error}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OwnedSwarmProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            http_post_json,
            http_get_data_url,
            http_get_text,
            websocket_json,
            probe_url,
            open_swarm_system,
            start_swarm,
            stop_swarm,
            swarm_process_status,
            backend_repo_status,
            backend_repo_fetch,
            backend_repo_switch,
            backend_repo_latest,
            swarm_repo_set_launch_auto_pull,
            studio_update_check,
            studio_update_apply
        ])
        .run(tauri::generate_context!())
        .expect("error while running Swarm Studio");
}
