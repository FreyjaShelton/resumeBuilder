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
const pdfBtn = document.getElementById("pdf-btn");
const printSheet = document.getElementById("print-sheet");
const printContent = document.getElementById("print-content");

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
        "only reframe and reprioritize what is already present in their resume.\n\n" +
        "Skills section: identify every skill, tool, technology, and qualification named in the " +
        "job listing. For each one the candidate's original resume already demonstrates — " +
        "explicitly, or clearly implied by the experience they describe — make sure it appears, " +
        "using the job listing's own wording, in a visible Skills section (add one near the top " +
        "if the resume doesn't already have one, or update the existing one). Do not add a " +
        "skill, tool, technology, or qualification that is not evidenced anywhere in the " +
        "candidate's original resume, even if the job listing asks for it — surfacing genuine " +
        "overlap is the goal, not padding the list.\n\n" +
        "Preserve the resume's existing format (plain text or Markdown) and keep contact " +
        "information exactly as given. Output only the revised resume text, with no preamble, " +
        "explanation, or commentary before or after it.",
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

// --- PDF export -------------------------------------------------------
//
// No PDF library: we render the result into an off-screen, fixed-size
// "print sheet" (see #print-sheet in style.css, sized to one US Letter
// page), auto-shrink its font size until the content fits within that one
// page, then hand off to the browser's native print-to-PDF. Everything
// rendered is plain visible text — the same content already shown in the
// output box, just formatted.

const PRINT_PAGE_HEIGHT_PX = 1056; // 11in at the 96px/in CSS reference
const PRINT_PAGE_MARGIN_PX = 72; // 0.75in
const PRINT_FONT_MAX_PX = 14;
const PRINT_FONT_MIN_PX = 8.5;
const PRINT_FONT_STEP_PX = 0.5;

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatInline(escapedText) {
  // Bold only (**text**) — the input is escaped already, so this can only
  // ever wrap existing text in <strong>, never introduce new markup.
  return escapedText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function renderResumeHtml(text) {
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    const bullet = line.match(/^[-*]\s+(.*)/);

    if (heading) {
      closeList();
      const tag = ["h1", "h2", "h3"][heading[1].length - 1];
      html += `<${tag}>${formatInline(escapeHtml(heading[2]))}</${tag}>`;
    } else if (bullet) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${formatInline(escapeHtml(bullet[1]))}</li>`;
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${formatInline(escapeHtml(line))}</p>`;
    }
  }
  closeList();
  return html;
}

pdfBtn.addEventListener("click", () => {
  const text = outputEl.value.trim();
  if (!text) {
    setStatus("Nothing to export yet — append or tailor a resume first.", "error");
    return;
  }

  printContent.innerHTML = renderResumeHtml(text);

  const maxContentHeight = PRINT_PAGE_HEIGHT_PX - 2 * PRINT_PAGE_MARGIN_PX;
  let fontSize = PRINT_FONT_MAX_PX;
  printContent.style.fontSize = `${fontSize}px`;
  while (printContent.scrollHeight > maxContentHeight && fontSize > PRINT_FONT_MIN_PX) {
    fontSize -= PRINT_FONT_STEP_PX;
    printContent.style.fontSize = `${fontSize}px`;
  }

  if (printContent.scrollHeight > maxContentHeight) {
    setStatus(
      "This result is long enough that it may not all fit on one printed page even at the " +
        "smallest readable size — trim it for a clean one-pager, or continue and check the " +
        "print preview.",
      "error"
    );
  } else {
    setStatus('Opening the print dialog — choose "Save as PDF" as the destination.', "success");
  }

  window.print();
});
