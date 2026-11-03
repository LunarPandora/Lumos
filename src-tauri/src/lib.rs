use std::collections::HashMap;
use std::process::Command;
use tauri::{RunEvent, Builder, generate_handler, AppHandle, Emitter};
use tauri_plugin_fs;

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  Builder::default()

    .setup(|app| {

      Command::new("sh")
        .arg("-c")
        .arg("colima status | grep -q Running || colima start")
        .spawn()
        .ok();

      Command::new("sh")
        .arg("-c")
        .arg(
          "docker start searxng 2>/dev/null || \
           docker run -d --name searxng -p 8080:8080 searxng/searxng"
        )
        .spawn()
        .ok();

      Ok(())
    })

    .plugin(tauri_plugin_fs::init())

    .invoke_handler(generate_handler![
        web_search,
        proxy_fetch,
        proxy_fetch_stream,
        commands::tool_read_file,
        commands::tool_list_files,
        commands::tool_search_code,
        commands::tool_edit_file,
        commands::tool_write_file,
    ])

    .build(tauri::generate_context!())
    .expect("error while building app")

    .run(|_app, event| {
      if let RunEvent::ExitRequested { .. } = event {

        Command::new("sh")
          .arg("-c")
          .arg("docker stop searxng")
          .spawn()
          .ok();

        Command::new("sh")
          .arg("-c")
          .arg("colima stop")
          .spawn()
          .ok();
      }
    });
}

#[tauri::command]
async fn web_search(query: String) -> Result<serde_json::Value, String> {
    let url = format!(
        "http://localhost:8080/search?q={}&format=json",
        urlencoding::encode(&query)
    );

    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    let results = json["results"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .take(5)
        .map(|item| {
            serde_json::json!({
                "title": item["title"].as_str().unwrap_or(""),
                "snippet": item["content"].as_str().unwrap_or(""),
                "url": item["url"].as_str().unwrap_or("")
            })
        })
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "query": query,
        "results": results
    }))
}

#[tauri::command]
async fn proxy_fetch(
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    method: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let http_method = method.unwrap_or_else(|| "GET".to_string());

    let mut req = match http_method.as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => client.get(&url),
    };

    if let Some(hdrs) = headers {
        for (key, value) in hdrs {
            req = req.header(&key, &value);
        }
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    let text = res.text().await.map_err(|e| e.to_string())?;

    Ok(text)
}

#[tauri::command]
async fn proxy_fetch_stream(
    app: AppHandle,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    method: Option<String>,
    id: Option<String>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let http_method = method.unwrap_or_else(|| "GET".to_string());
    let stream_id = id.unwrap_or_else(|| "default".to_string());

    let mut req = match http_method.as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => client.get(&url),
    };

    if let Some(hdrs) = headers {
        for (key, value) in hdrs {
            req = req.header(&key, &value);
        }
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    let event_name = format!("proxy-stream-{}", stream_id);

    let mut stream = res.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit(&event_name, text);
            }
            Err(e) => {
                let _ = app.emit(&event_name, format!("__ERROR__{}", e));
                break;
            }
        }
    }

    let _ = app.emit(&event_name, "__DONE__");

    Ok(())
}
