use serde_json::{json, Value};
use std::{io::{BufRead, BufReader, Read, Write}, net::{TcpListener, TcpStream}, sync::{Arc, Mutex, OnceLock}, time::{Duration, SystemTime, UNIX_EPOCH}};

#[derive(Default)]
struct Feed { token: String, scope: String, expires: u64, received: u64, user: String, snapshot: Option<Value>, port: u16 }
static FEED: OnceLock<Arc<Mutex<Feed>>> = OnceLock::new();
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn error() -> String { "Lumi reference request rejected. Check pairing, scope and freshness.".into() }
fn receive(stream: &mut TcpStream, state: &Arc<Mutex<Feed>>) -> Result<(), String> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|_| error())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|_| error())?;
    let mut reader = BufReader::new(stream.try_clone().map_err(|_| error())?);
    let mut line = String::new(); Read::by_ref(&mut reader).take(16385).read_line(&mut line).map_err(|_| error())?;
    if line.trim() != "POST /__studio/lumi-bridge/push HTTP/1.1" { return Err(error()); }
    let mut length = None; let mut bearer = String::new(); let mut json_type = false; let mut total = line.len();
    loop {
        line.clear(); Read::by_ref(&mut reader).take(16385).read_line(&mut line).map_err(|_| error())?; total += line.len();
        if total > 16384 || line.is_empty() { return Err(error()); }
        if line == "\r\n" { break; }
        let (key, value) = line.split_once(':').ok_or_else(error)?;
        match key.to_ascii_lowercase().as_str() {
            "content-length" => { if length.is_some() { return Err(error()); } length = Some(value.trim().parse::<usize>().map_err(|_| error())?); },
            "authorization" => bearer = value.trim().strip_prefix("Bearer ").unwrap_or("").to_owned(),
            "content-type" => json_type = value.trim().starts_with("application/json"),
            "transfer-encoding" => return Err(error()), _ => {},
        }
    }
    let size = length.ok_or_else(error)?;
    if size > 20 * 1024 * 1024 || !json_type { return Err(error()); }
    {
        let feed = state.lock().map_err(|_| error())?;
        if feed.token.is_empty() || feed.expires <= now() || !secure_equal(bearer.as_bytes(), feed.token.as_bytes()) { return Err(error()); }
    }
    let mut body = vec![0; size]; reader.read_exact(&mut body).map_err(|_| error())?;
    let payload: Value = serde_json::from_slice(&body).map_err(|_| error())?;
    let mut feed = state.lock().map_err(|_| error())?;
    // Recheck after the network read: revocation/rotation must invalidate in-flight requests.
    if feed.expires <= now() || !secure_equal(bearer.as_bytes(), feed.token.as_bytes()) { return Err(error()); }
    accept(&mut feed, payload)?;
    Ok(())
}
fn secure_equal(a: &[u8], b: &[u8]) -> bool { a.len() == b.len() && bool::from(subtle::ConstantTimeEq::ct_eq(a, b)) }
fn accept(feed: &mut Feed, body: Value) -> Result<(), String> {
    let user = body["sourceUserId"].as_str().ok_or_else(error)?;
    let snap = &body["snapshot"]; let at = snap["generatedAt"].as_u64().ok_or_else(error)?;
    let old = feed.snapshot.as_ref().and_then(|s| s["generatedAt"].as_u64()).unwrap_or(0);
    let claims = snap["claims"].as_array().ok_or_else(error)?;
    if user.is_empty() || user.len() > 200 || (!feed.user.is_empty() && feed.user != user) || body["scope"].as_str() != Some(&feed.scope)
        || snap["schema"] != 1 || !snap["complete"].is_boolean() || !snap["activeJobs"].is_boolean()
        || !snap["coverage"].as_array().is_some_and(|values| values.iter().all(Value::is_string)) || claims.len() > 100000
        || at <= old || at > now() + 5000 || now().saturating_sub(at) > 120000 { return Err(error()); }
    let uuid = |value: &Value| value.as_str().is_some_and(|s| { let bytes=s.as_bytes(); bytes.len()==36 && [8,13,18,23].iter().all(|i| bytes[*i]==b'-') && s.chars().enumerate().all(|(i,c)| [8,13,18,23].contains(&i) || c.is_ascii_hexdigit()) && [b'4',b'7'].contains(&bytes[14]) && [b'8',b'9',b'a',b'b',b'A',b'B'].contains(&bytes[19]) });
    for c in claims {
        if !uuid(&c["assetId"]) || !uuid(&c["metadata"]["studio_pipeline_id"]) || !(c["metadata"]["studio_parent_id"] == "" || uuid(&c["metadata"]["studio_parent_id"]))
            || !c["metadata"]["studio_stage"].as_str().is_some_and(|s| ["general_generation","expression_draft","expression_final","upscale_result","background_removed","inpaint_variant","inline_illustration"].contains(&s))
            || !c["metadata"].as_object().is_some_and(|m| m.iter().all(|(key,value)| !key.starts_with("studio_") || value.is_string()))
            || !c["assetId"].is_string() || c["metadata"]["studio_asset_id"] != c["assetId"] || c["metadata"]["studio_schema"] != "1"
            || c["metadata"]["studio_origin"] != "lumiswarm" || !c["imageId"].is_string() || !c["swarmPath"].is_string()
            || !c["scope"].is_string()
            || !["swarmPathVerified", "persisted", "usableCopyVerified", "protected"].iter().all(|key| c[*key].is_boolean())
            || !c["references"].as_array().is_some_and(|values| values.iter().all(Value::is_string)) { return Err(error()); }
    }
    feed.user = user.into(); feed.received = now(); feed.snapshot = Some(snap.clone()); Ok(())
}
fn server() -> Result<Arc<Mutex<Feed>>, String> {
    if let Some(state) = FEED.get() { return Ok(state.clone()); }
    let listener = TcpListener::bind("0.0.0.0:0").map_err(|_| "Could not start the read-only Lumi receiver.".to_string())?;
    let state = Arc::new(Mutex::new(Feed { port: listener.local_addr().map_err(|_| error())?.port(), ..Feed::default() }));
    if FEED.set(state.clone()).is_err() { return FEED.get().cloned().ok_or_else(error); }
    let shared = state.clone();
    std::thread::spawn(move || {
        let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        for mut stream in listener.incoming().flatten() {
            if active.fetch_add(1, std::sync::atomic::Ordering::SeqCst) >= 4 { active.fetch_sub(1,std::sync::atomic::Ordering::SeqCst); continue; }
            let shared = shared.clone(); let active = active.clone();
            std::thread::spawn(move || {
            let ok = receive(&mut stream, &shared).is_ok();
            let body = if ok { "{\"accepted\":true}" } else { "{\"error\":\"Reference feed rejected\"}" };
            let _ = write!(stream, "HTTP/1.1 {}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", if ok { "200 OK" } else { "400 Bad Request" }, body.len(), body);
                active.fetch_sub(1,std::sync::atomic::Ordering::SeqCst);
            });
        }
    });
    Ok(state)
}
#[tauri::command]
pub fn lumi_reference_bridge(action: String, scope: Option<String>, origin: Option<String>) -> Result<Value, String> {
    let shared = if action == "pair" { server()? } else if let Some(shared) = FEED.get() { shared.clone() }
        else if action == "state" || action == "disconnect" { return Ok(json!({"paired":false,"scope":"","expiresAt":0,"receivedAt":0,"sourceUserId":"","snapshot":null})); }
        else { return Err(error()); };
    let mut feed = shared.lock().map_err(|_| error())?;
    match action.as_str() {
        "pair" => {
            let scope = scope.ok_or_else(error)?; let routing: Value = serde_json::from_str(&scope).map_err(|_| error())?;
            if !routing.as_array().is_some_and(|r| r.len() == 3 && r[0].is_string() && r[1].is_string() && r[2].is_boolean()) { return Err(error()); }
            let mut target = reqwest::Url::parse(origin.as_deref().unwrap_or("http://127.0.0.1")).map_err(|_| error())?;
            if !["http", "https"].contains(&target.scheme()) || !target.username().is_empty() || target.password().is_some() || target.scheme() != "http" { return Err(error()); }
            target.set_port(Some(feed.port)).map_err(|_| error())?; target.set_path("/__studio/lumi-bridge/push"); target.set_query(None); target.set_fragment(None);
            let mut bytes = [0u8; 32]; getrandom::getrandom(&mut bytes).map_err(|_| "Secure credential generation is unavailable.".to_string())?;
            feed.token = bytes.iter().map(|b| format!("{b:02x}")).collect(); feed.scope = scope; feed.expires = now() + 30 * 86400000; feed.received = 0; feed.user.clear(); feed.snapshot = None;
            Ok(json!({"version":1,"url":target.as_str(),"token":feed.token,"scope":feed.scope,"expiresAt":feed.expires}))
        },
        "state" => Ok(json!({"paired":!feed.token.is_empty() && feed.expires > now(),"scope":feed.scope,"expiresAt":feed.expires,"receivedAt":feed.received,"sourceUserId":feed.user,"snapshot":if feed.expires > now() {feed.snapshot.clone()} else {None}})),
        "disconnect" => { let port = feed.port; *feed = Feed {port,..Feed::default()}; Ok(json!({})) },
        _ => Err(error()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn feed_binds_user_scope_freshness_and_rejects_replays() {
        let mut feed = Feed { scope:"scope".into(),..Feed::default() };
        let body = json!({"sourceUserId":"alice","scope":"scope","snapshot":{"schema":1,"generatedAt":now(),"complete":false,"activeJobs":false,"coverage":[],"claims":[]}});
        assert!(accept(&mut feed,body.clone()).is_ok()); assert!(accept(&mut feed,body.clone()).is_err());
        let mut other = body; other["sourceUserId"] = json!("bob"); other["snapshot"]["generatedAt"] = json!(now()+1); assert!(accept(&mut feed,other).is_err());
        assert!(!secure_equal(b"one",b"two"));
    }
    #[tokio::test]
    async fn native_http_receiver_checks_authentication_and_revocation() {
        let scope = "[\"http://swarm.test\",\"local\",true]".to_string();
        let pair = lumi_reference_bridge("pair".into(),Some(scope.clone()),Some("http://127.0.0.1".into())).unwrap();
        let url = pair["url"].as_str().unwrap();
        let client = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(5)).build().unwrap();
        let body = json!({"sourceUserId":"native-fixture","scope":scope,"snapshot":{"schema":1,"generatedAt":now(),"complete":false,"activeJobs":false,"coverage":[],"claims":[]}});
        assert!(!client.post(url).json(&body).send().await.unwrap().status().is_success());
        assert!(client.post(url).bearer_auth(pair["token"].as_str().unwrap()).json(&body).send().await.unwrap().status().is_success());
        assert!(!client.post(url).bearer_auth(pair["token"].as_str().unwrap()).json(&body).send().await.unwrap().status().is_success());
        let state = lumi_reference_bridge("state".into(),None,None).unwrap();
        assert_eq!(state["sourceUserId"],"native-fixture"); assert!(state.get("token").is_none());
        lumi_reference_bridge("disconnect".into(),None,None).unwrap();
        assert!(!client.post(url).bearer_auth(pair["token"].as_str().unwrap()).json(&body).send().await.unwrap().status().is_success());
    }
}
