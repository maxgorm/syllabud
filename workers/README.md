# SyllaBud Cloudflare Worker

Deploy this Worker to keep model credentials server-side. For Google Cloud billing, use Vertex AI with credentials stored in Cloudflare secrets. The extension never receives the credentials directly.

## Recommended setup: Vertex AI

This path uses your Google Cloud project and bills through Vertex AI, which is the right setup if you want usage to count against Google Cloud billing and credits.

### 1. Prepare Google Cloud

1. Create or choose a GCP project.
2. Enable the Vertex AI API for that project.
3. Choose one authentication path:
4. Preferred if your org allows it: service account credentials.
5. Best fallback if service-account key creation is blocked: a Google Cloud API key for Vertex AI.

### 2. Install and authenticate Wrangler

```bash
cd workers
npm install
npx wrangler login
```

### 3. Add private Worker secrets

#### Option A: Vertex AI with a service account JSON

Recommended:

```bash
npx wrangler secret put GCP_SERVICE_ACCOUNT_JSON
```

Paste the full service-account JSON when prompted.

Optional:

```bash
npx wrangler secret put ALLOWED_EXTENSION_IDS
npx wrangler secret put VERTEX_LOCATION
npx wrangler secret put VERTEX_MODEL
```

- `ALLOWED_EXTENSION_IDS` can be `*` during development or a comma-separated list of Chrome extension IDs in production.
- `VERTEX_LOCATION` defaults to `us-central1`.
- `VERTEX_MODEL` defaults to `gemini-2.5-flash-lite`.

Alternative to `GCP_SERVICE_ACCOUNT_JSON`:

```bash
npx wrangler secret put GCP_PROJECT_ID
npx wrangler secret put GCP_CLIENT_EMAIL
npx wrangler secret put GCP_PRIVATE_KEY
```

The Worker supports either the full JSON secret or those three separate secrets.

#### Option B: Vertex AI with a Google Cloud API key

If your organization blocks service-account JSON keys with `iam.disableServiceAccountKeyCreation`, use a Vertex AI API key instead:

```bash
npx wrangler secret put GOOGLE_API_KEY
```

Optional:

```bash
npx wrangler secret put VERTEX_MODEL
npx wrangler secret put ALLOWED_EXTENSION_IDS
```

The Worker will use Vertex AI with `GOOGLE_API_KEY` before falling back to `GEMINI_API_KEY`.

## Local development

```bash
npm run dev
```

The Worker exposes the same endpoints as the Node backend:

- `GET /health`
- `GET /rate-limit-status`
- `POST /gemini`

## Deploy

```bash
npm run deploy
```

Your deployed URL is:

```text
https://syllabud-worker.gabepush.workers.dev
```

## Extension configuration

The extension defaults already point to:

```text
https://syllabud-worker.gabepush.workers.dev
```

If you previously used `http://localhost:3000`, reload the extension after deploying so the stored backend URL migration takes effect.

## Security

- The service account stays in Cloudflare Worker secrets.
- Do not place the service-account JSON, private key, or any API key in the extension, popup, or any client-side file.
- Restrict `ALLOWED_EXTENSION_IDS` in production so random extensions cannot call your Worker.

## Optional fallback: Gemini Developer API

If you intentionally want the older AI Studio billing path, the Worker still supports:

```bash
npx wrangler secret put GEMINI_API_KEY
```

The Worker will prefer Vertex AI service-account secrets first, then `GOOGLE_API_KEY`, and use `GEMINI_API_KEY` only as a final fallback.
