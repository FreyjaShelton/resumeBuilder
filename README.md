# Resume Tailor

A small, static, client-only web app: paste your resume and a job listing, then either

- **Append** the job listing to your resume verbatim (no AI, no API key needed), or
- **Tailor** your resume to the listing using Claude — Claude reorders/rewrites your existing
  bullet points to foreground relevant experience and keywords, without inventing anything you
  didn't already have on your resume.

There is no backend. Everything — including the call to the Anthropic API for the AI-tailoring
option — runs directly in your browser. Your Anthropic API key is stored only in your browser's
`localStorage` and is sent straight from your browser to `api.anthropic.com`; it never passes
through any server of ours. Only use this with a key you control, and be aware that anyone with
access to your browser's dev tools can see it (see [API key best
practices](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)).

## Running locally

No build step or dependencies — just serve the folder, e.g.:

```sh
python3 -m http.server 8000
```

then open `http://localhost:8000`.

(Opening `index.html` directly via `file://` also mostly works, but some browsers restrict
`fetch`/ES module imports from `file://` — a local server avoids that.)

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch".
4. Pick the branch (e.g. `main`) and the `/ (root)` folder, then save.
5. GitHub will publish the site at `https://<user>.github.io/<repo>/` within a minute or two.

Get an API key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
