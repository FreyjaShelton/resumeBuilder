const ANTHROPIC_SDK_URL = "https://esm.sh/@anthropic-ai/sdk@0.68.0";
let anthropicSdkPromise = null;

// Loaded lazily (only when AI tailoring is actually used) so that a slow or
// unreachable CDN never breaks the offline "append" feature.
function loadAnthropicSdk() {
  if (!anthropicSdkPromise) {
    anthropicSdkPromise = import(ANTHROPIC_SDK_URL).then((mod) => mod.default);
  }
  return anthropicSdkPromise;
}

const MODEL = "claude-opus-5";
const API_KEY_STORAGE_KEY = "resumeTailor.anthropicApiKey";

const apiKeyInput = document.getElementById("api-key");
const toggleKeyBtn = document.getElementById("toggle-key-visibility");
const resumeInput = document.getElementById("resume-input");
const jobInput = document.getElementById("job-input");
const appendBtn = document.getElementById("append-btn");
const tailorBtn = document.getElementById("tailor-btn");
const statusEl = document.getElementById("status");
const outputPanel = document.getElementById("output-panel");
const outputEl = document.getElementById("output");
const copyBtn = document.getElementById("copy-btn");
const downloadBtn = document.getElementById("download-btn");

const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
if (storedKey) {
  apiKeyInput.value = storedKey;
}

apiKeyInput.addEventListener("input", () => {
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.value.trim());
});

toggleKeyBtn.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  toggleKeyBtn.textContent = isPassword ? "Hide" : "Show";
});

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function showOutput(text) {
  outputEl.value = text;
  outputPanel.hidden = false;
  outputPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setBusy(busy) {
  appendBtn.disabled = busy;
  tailorBtn.disabled = busy;
}

function getInputs() {
  const resume = resumeInput.value.trim();
  const job = jobInput.value.trim();
  return { resume, job };
}

appendBtn.addEventListener("click", () => {
  const { resume, job } = getInputs();
  if (!resume || !job) {
    setStatus("Paste both your resume and the job listing first.", "error");
    return;
  }
  const merged = `${resume}\n\n---\n\n## Job Listing (for reference)\n\n${job}\n`;
  showOutput(merged);
  setStatus("Job listing appended.", "success");
});

tailorBtn.addEventListener("click", async () => {
  const { resume, job } = getInputs();
  if (!resume || !job) {
    setStatus("Paste both your resume and the job listing first.", "error");
    return;
  }
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("Add your Anthropic API key above to use AI tailoring.", "error");
    apiKeyInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Tailoring your resume with Claude...");

  try {
    const Anthropic = await loadAnthropicSdk();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system:
        "You are an expert resume writer and career coach. You will be given a candidate's " +
        "existing resume and a job listing they want to apply to. Rewrite the resume so it is " +
        "tailored to the job listing: reorder and rephrase bullet points to foreground the most " +
        "directly relevant experience and skills, and incorporate keywords and terminology from " +
        "the listing wherever the candidate genuinely has that experience. Do not fabricate or " +
        "invent employers, titles, dates, skills, or experience the candidate does not have — " +
        "only reframe and reprioritize what is already present in their resume. Preserve the " +
        "resume's existing format (plain text or Markdown) and keep contact information exactly " +
        "as given. Output only the revised resume text, with no preamble, explanation, or " +
        "commentary before or after it.",
      messages: [
        {
          role: "user",
          content:
            `## Candidate's current resume\n\n${resume}\n\n` +
            `## Job listing to tailor the resume for\n\n${job}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      setStatus("Claude declined this request. Try rephrasing the resume or job listing.", "error");
      return;
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    showOutput(text);
    setStatus("Resume tailored.", "success");
  } catch (err) {
    console.error(err);
    if (err && err.status === 401) {
      setStatus("Invalid API key. Double-check it and try again.", "error");
    } else if (err && err.status === 429) {
      setStatus("Rate limited by Anthropic. Wait a moment and try again.", "error");
    } else if (err && err.status) {
      setStatus(`Anthropic API error (${err.status}): ${err.message || "request failed"}`, "error");
    } else {
      setStatus("Request failed — check your connection and API key, then try again.", "error");
    }
  } finally {
    setBusy(false);
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(outputEl.value);
    setStatus("Copied to clipboard.", "success");
  } catch (err) {
    console.error(err);
    setStatus("Couldn't copy automatically — select the text and copy manually.", "error");
  }
});

downloadBtn.addEventListener("click", () => {
  const blob = new Blob([outputEl.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resume.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
