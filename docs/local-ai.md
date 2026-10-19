# Local AI assistant

Glass Keep 1.0.12 replaces the old Llama/Transformers.js generator with a pinned llama.cpp CPU worker and **Qwen3.5 0.8B Q4_K_M**. Native clients 1.0.8 show progressive answers and source-note links. All inference happens on your Glass Keep server; the client apps still require a server.

## Using it

From **1.0.14**, enabling or disabling AI is saved to your account on this server and shared across web, Windows, macOS and Android. New accounts start with AI off and see a resource warning before enabling. Other devices refresh when opened, focused or reconnected, and every ten seconds while visible. An existing device's old enabled preference is migrated once if the account has no saved choice. Changing the setting requires a reachable, updated server; offline devices retain their own account's last synced setting. The model is downloaded once into the server cache and reused by all accounts and devices; phones and laptops never download model weights.

Enable **Settings → Local AI Assistant**, enter a question in search, and press **Ask AI** or Enter. The button shows **Asking AI…** while the request runs and prevents duplicate submissions. The first question downloads a **532,517,120-byte (about 533 MB)** model from Hugging Face into `ai-models` beside your notes database. The download uses a pinned revision and verifies SHA-256 before loading. Allow additional free disk space for the search index and temporary download. Later questions use the cached file without downloading it again.

The worker starts on a question, understands the query, retrieves matching saved notes, and writes a short answer. It stops after **60 seconds with no active request**, releasing its process allocations. The model remains on disk. System file caches may remain reclaimable by the OS. Loading is not instantaneous; CPU, disk speed, note context, and server memory affect latency. No GPU is required. The download size is not a RAM requirement or limit.

The panel shows downloading/loading/searching/writing states, progressive text, and numbered source-note links. Close the panel to cancel. Signing out, changing account, or disabling AI also cancels. Abandoned asynchronous requests expire after their polling stops. One question runs at a time across the server to bound memory; other callers receive a busy message.

## Retrieval and privacy

This first version uses SQLite FTS5/BM25, with Unicode-aware indexing of titles, text, checklist items and tags. Matching questions go directly to answer generation; Qwen expands keywords or normalizes non-English questions only when the first search has no matches. It is **not a separate vector-embedding search engine**: one small generative model handles the fallback and answers. This avoids another model and vector service. Retrieval includes your own and currently shared notes, including archived notes; every source is checked against the requesting user's current permissions. Edits, imports and deletions update the index automatically. Unsynced offline edits are not available to the server AI.

The server retrieves notes itself; it ignores note bodies supplied by clients. Only selected text excerpts enter the prompt, with a 4,096-token context and a bounded answer. Image/drawing contents are not analyzed. A tokenizer check reduces excerpts when necessary, including for Hindi and French. Instructions ask the model to answer from notes and admit missing information. Numbered source buttons open the retrieved notes; they are not proof of every generated claim. Small models can omit details, mistranslate names or make mistakes, especially across languages; source links help verify answers. It does not browse the web. Recommendations should be checked against the source notes.

Notes and questions stay on your server. Downloading the model contacts Hugging Face and its file delivery service; it does not send your notes. The llama.cpp worker listens only on loopback with a random internal API key. Completed answers are private temporary memory, not a persistent chat history; they expire after five minutes or when the client closes the request. Do not expose the worker's port through your reverse proxy.

## Deployment and local development

The standard Docker image includes llama.cpp for AMD64/ARM64. Keep your existing data volume, `TRUST_PROXY=1` for Nginx Proxy Manager, and other settings. No second container, cloud key, or new mandatory environment variable is needed. Pull and recreate the container in Portainer; update client apps separately.

Optional server variables:

| Variable | Default | Purpose |
|---|---|---|
| `AI_IDLE_SECONDS` | `60` | Worker inactivity timeout; `0` stops it after every answer |
| `AI_THREADS` | Up to 4 available CPU threads | Limit active inference CPU use |
| `AI_CACHE_DIR` | `ai-models` beside the database | Persistent model download directory |
| `LLAMA_SERVER_BIN` | Included in Docker | Path to `llama-server` for non-Docker development |

For development outside Docker, install llama.cpp compatible with pinned upstream commit `620d2225cc436ab0b001e3200e590e3b286ef9ab` (v0.7.0), then set `LLAMA_SERVER_BIN` to its executable. The application starts and all ordinary note features work without it; an AI question reports installation guidance if the executable is missing. On Windows, keep the executable and its DLLs together. The model downloads on the first question.

The old `data/ai-cache` folder is no longer used. Upgrading does not delete it or any notes. If reclaiming its space, stop the old container first, verify the directory in your mounted data volume, and remove only that obsolete model-cache folder. Keep `notes.db`, its SQLite sidecars, and the new `ai-models` folder.

Upstream: [llama.cpp](https://github.com/ggml-org/llama.cpp), [Qwen model](https://huggingface.co/Qwen/Qwen3.5-0.8B), [pinned GGUF weights](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/tree/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0).
