use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use tauri::{ipc::Channel, State};

#[derive(Default)]
pub struct LlmStreams(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Deserialize)]
pub struct LlmRequest {
    url: String,
    headers: HashMap<String, String>,
    body: serde_json::Value,
}

#[derive(Deserialize)]
pub struct LlmModelsRequest {
    url: String,
    headers: HashMap<String, String>,
}

#[tauri::command]
pub async fn list_llm_models(request: LlmModelsRequest) -> Result<String, String> {
    let url = reqwest::Url::parse(&request.url).map_err(|_| "Invalid model list URL")?;
    if !["http", "https"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() || !url.path().ends_with("/models") { return Err("Invalid model list endpoint".into()); }
    let mut seen = std::collections::HashSet::new();
    for (key, value) in url.query_pairs() {
        if !["pageSize", "pageToken", "limit", "after_id"].contains(&key.as_ref()) || !seen.insert(key.to_string()) || value.len() > 4096 { return Err("Invalid model pagination".into()); }
        if ["pageSize", "limit"].contains(&key.as_ref()) && !value.parse::<u32>().is_ok_and(|n| (1..=1000).contains(&n)) { return Err("Invalid model pagination".into()); }
    }
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(20)).build().map_err(|_| "Could not initialize model discovery")?;
    let mut get = client.get(url).header("accept", "application/json");
    for (key, value) in request.headers {
        if !["authorization", "x-api-key", "x-goog-api-key", "anthropic-version", "content-type"].contains(&key.to_lowercase().as_str()) || value.contains(['\r', '\n']) { return Err("Invalid LLM header".into()); }
        get = get.header(&key, value);
    }
    let mut response = get.send().await.map_err(|_| "Model discovery failed. Check the API base URL and network.")?;
    if !response.status().is_success() { return Err(format!("Model discovery returned HTTP {}. Check the key and base URL, or enter a model ID manually.", response.status().as_u16())); }
    if !response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").contains("application/json") { return Err("Model discovery returned a non-JSON response".into()); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Model discovery was interrupted")? {
        if bytes.len() + chunk.len() > 8 * 1024 * 1024 { return Err("Model list is too large".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let text = String::from_utf8(bytes).map_err(|_| "Model list was not UTF-8")?;
    serde_json::from_str::<serde_json::Value>(&text).map_err(|_| "Model list was not valid JSON")?;
    Ok(text)
}

#[tauri::command]
pub fn cancel_llm_stream(id: String, state: State<'_, LlmStreams>) {
    if let Ok(streams) = state.0.lock() {
        if let Some(cancel) = streams.get(&id) { cancel.store(true, Ordering::Relaxed); }
    }
}

async fn cancelled(flag: &AtomicBool) {
    while !flag.load(Ordering::Relaxed) { tokio::time::sleep(Duration::from_millis(50)).await; }
}

#[tauri::command]
pub async fn stream_llm(id: String, request: LlmRequest, on_chunk: Channel<Vec<u8>>, state: State<'_, LlmStreams>) -> Result<(), String> {
    let flag = Arc::new(AtomicBool::new(false));
    state.0.lock().map_err(|_| "LLM stream lock failed")?.insert(id.clone(), flag.clone());
    let result = tokio::select! {
        _ = cancelled(&flag) => Err("LLM stream cancelled".to_string()),
        result = forward(request, on_chunk) => result,
    };
    state.0.lock().map_err(|_| "LLM stream lock failed")?.remove(&id);
    result
}

async fn forward(request: LlmRequest, on_chunk: Channel<Vec<u8>>) -> Result<(), String> {
    let url = reqwest::Url::parse(&request.url).map_err(|_| "Invalid LLM URL")?;
    let path = url.path();
    let valid_path = path.ends_with("/responses") || path.ends_with("/messages") || path.ends_with("/chat/completions") || (path.contains("/models/") && path.ends_with(":streamGenerateContent"));
    if !["http", "https"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() || !valid_path || url.query().is_some_and(|q| q != "alt=sse") || !request.body.is_object() {
        return Err("Invalid LLM endpoint".into());
    }
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(180)).build().map_err(|_| "Could not initialize LLM connection")?;
    let mut post = client.post(url).json(&request.body).header("accept", "text/event-stream");
    for (key, value) in request.headers {
        if !["authorization", "x-api-key", "x-goog-api-key", "anthropic-version", "content-type"].contains(&key.to_lowercase().as_str()) || value.contains(['\r', '\n']) { return Err("Invalid LLM header".into()); }
        post = post.header(&key, value);
    }
    let mut response = post.send().await.map_err(|_| "LLM connection failed. Check the API base URL and network.")?;
    if !response.status().is_success() { return Err(format!("LLM provider returned HTTP {}. Check the key, model, and reasoning support.", response.status().as_u16())); }
    if !response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").contains("text/event-stream") { return Err("The LLM provider did not return SSE".into()); }
    while let Some(bytes) = response.chunk().await.map_err(|_| "LLM stream was interrupted")? {
        on_chunk.send(bytes.to_vec()).map_err(|_| "LLM stream closed")?;
    }
    // The invoke promise can arrive before Channel deliveries in the webview. This
    // ordered sentinel lets the frontend drain all bytes before validating EOF.
    on_chunk.send(Vec::new()).map_err(|_| "LLM stream closed")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use tauri::ipc::InvokeResponseBody;

    fn endpoint(response: impl AsRef<[u8]>) -> (String, std::thread::JoinHandle<()>) {
        let response = response.as_ref().to_vec();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/v1/responses", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut bytes = [0u8; 4096];
            let _ = stream.read(&mut bytes).unwrap();
            stream.write_all(&response).unwrap();
        });
        (url, server)
    }

    fn request(url: String) -> LlmRequest {
        LlmRequest { url, headers: HashMap::from([("authorization".into(), "Bearer fixture-key".into())]), body: serde_json::json!({"model":"fixture","input":"idea","stream":true}) }
    }

    #[tokio::test]
    async fn native_stream_forwards_sse_bytes() {
        let body = b"data: [DONE]\n\n";
        let (url, server) = endpoint(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 14\r\nConnection: close\r\n\r\ndata: [DONE]\n\n");
        let captured = Arc::new(Mutex::new(Vec::<Vec<u8>>::new()));
        let sink = captured.clone();
        let channel = Channel::new(move |message| {
            let bytes: Vec<u8> = match message { InvokeResponseBody::Json(text) => serde_json::from_str(&text).unwrap(), InvokeResponseBody::Raw(bytes) => bytes };
            sink.lock().unwrap().push(bytes); Ok(())
        });
        forward(request(url), channel).await.unwrap();
        server.join().unwrap();
        let chunks = captured.lock().unwrap();
        assert_eq!(chunks.concat(), body);
        assert_eq!(chunks.last(), Some(&Vec::new()), "ordered EOF must follow all bytes");
    }

    #[tokio::test]
    async fn native_errors_do_not_echo_provider_bodies_or_keys() {
        let (url, server) = endpoint(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 11\r\nConnection: close\r\n\r\nfixture-key");
        let error = forward(request(url), Channel::new(|_| Ok(()))).await.unwrap_err();
        server.join().unwrap();
        assert!(error.contains("401")); assert!(!error.contains("fixture-key"));
        let error = forward(request("file:///tmp/responses".into()), Channel::new(|_| Ok(()))).await.unwrap_err();
        assert!(error.contains("Invalid LLM endpoint"));
    }

    #[tokio::test]
    async fn native_model_discovery_returns_json_and_restricts_endpoint() {
        let body = r#"{"data":[{"id":"fixture-model"}]}"#;
        let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
        let (url, server) = endpoint(response);
        let text = list_llm_models(LlmModelsRequest { url: url.replace("/responses", "/models?limit=1000"), headers: HashMap::new() }).await.unwrap();
        server.join().unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&text).unwrap()["data"][0]["id"], "fixture-model");
        for url in ["file:///tmp/models", "http://127.0.0.1/private", "http://127.0.0.1/models?key=secret", "http://127.0.0.1/models?limit=2&limit=3"] {
            assert!(list_llm_models(LlmModelsRequest { url: url.into(), headers: HashMap::new() }).await.is_err());
        }
    }
}
