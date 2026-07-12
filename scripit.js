// ─── Config ───────────────────────────────────────────────────────────────────
const AI_API = "https://adisharm4988-easydebuger.hf.space/api/explain-error";
const JUDGE0   = "https://ce.judge0.com/submissions?base64_encoded=false&wait=true";
const JUDGE0_KEY = "2a555f2199acc13abd4b58ef6bf6946b";

// ─── Language definitions ─────────────────────────────────────────────────────
const LANGUAGES = {
  java: {
    id: 62,
    monaco: "java",
    label: "Java",
    template: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");

        // Try some arithmetic
        int a = 5, b = 3;
        System.out.println("Sum: " + (a + b));
        System.out.println("Product: " + (a * b));
    }
}`
  },
  python: {
    id: 71,
    monaco: "python",
    label: "Python",
    template: `# Python starter
print("Hello, World!")

# Try some list operations
nums = [1, 2, 3, 4, 5]
squared = [x ** 2 for x in nums]
print("Squares:", squared)
print("Sum:", sum(nums))
`
  },
  cpp: {
    id: 54,
    monaco: "cpp",
    label: "C++",
    template: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;


    return 0;
}`
  },
  javascript: {
    id: 63,
    monaco: "javascript",
    label: "JavaScript",
    template: `// JavaScript starter
console.log("Hello, World!");

`
  }
};

// ─── State ────────────────────────────────────────────────────────────────────
let editor;
let currentLang = "java";
let lastRunOutput = "";     // stdout+stderr text from the most recent run, for chat context
let chatHistory = [];       // { role: 'user'|'ai', text }
let runClickCount = 0;
const INTERSTITIAL_EVERY = 5;

// ─── Monaco setup ─────────────────────────────────────────────────────────────
require.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" }
});

require(["vs/editor/editor.main"], function () {
  monaco.editor.defineTheme("ai-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment",   foreground: "3d4a6b", fontStyle: "italic" },
      { token: "keyword",   foreground: "00d4ff" },
      { token: "string",    foreground: "00f5a0" },
      { token: "number",    foreground: "ffd060" },
      { token: "type",      foreground: "80c8ff" },
      { token: "delimiter", foreground: "5a6a9a" },
    ],
    colors: {
      "editor.background":           "#0b0d15",
      "editor.foreground":           "#c8cfe8",
      "editorCursor.foreground":     "#00f5a0",
      "editor.lineHighlightBackground": "#131828",
      "editorLineNumber.foreground": "#2e3560",
      "editorLineNumber.activeForeground": "#4a5888",
      "editor.selectionBackground":  "#1e2a4a",
      "editor.inactiveSelectionBackground": "#141c30",
      "editorIndentGuide.background1": "#1a1f35",
    }
  });

  editor = monaco.editor.create(document.getElementById("editor"), {
    value: LANGUAGES[currentLang].template,
    language: LANGUAGES[currentLang].monaco,
    theme: "ai-dark",
    automaticLayout: true,
    fontSize: 13.5,
    lineHeight: 22,
    fontFamily: "'Space Mono', 'Consolas', monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    padding: { top: 14, bottom: 14 },
    renderLineHighlight: "all",
    cursorBlinking: "phase",
    smoothScrolling: true,
  });
});

// ─── Language switching ───────────────────────────────────────────────────────
document.querySelectorAll(".lang-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    const lang = pill.dataset.lang;
    if (lang === currentLang) return;
    currentLang = lang;

    document.querySelectorAll(".lang-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");

    const langDef = LANGUAGES[lang];
    monaco.editor.setModelLanguage(editor.getModel(), langDef.monaco);
    editor.setValue(langDef.template);

    resetPanels();
  });
});

// ─── Reset button ─────────────────────────────────────────────────────────────
document.getElementById("btn-reset").addEventListener("click", () => {
  editor.setValue(LANGUAGES[currentLang].template);
  document.getElementById("stdin-input").value = "";
  resetPanels();
});

function resetPanels() {
  const term = document.getElementById("terminal");
  term.innerHTML = `
    <div class="terminal-idle">
      <span class="terminal-prompt">▶</span>
      <span class="terminal-idle-text">Click <strong>RUN</strong> to execute your code…</span>
    </div>`;
  document.getElementById("input-panel").className = "io-panel";
  document.getElementById("output-panel").className = "io-panel";

  document.getElementById("output-badge").textContent = "—";
  document.getElementById("output-badge").className = "panel-badge";
  document.getElementById("ai-badge").textContent = "—";
  document.getElementById("ai-badge").className = "panel-badge ai-badge";

  lastRunOutput = "";
  chatHistory = [];
  const chat = document.getElementById("ai-chat");
  chat.innerHTML = `
    <div class="ai-idle" id="ai-idle-msg">
      <div class="ai-icon">⬡</div>
      <p>Ask the AI about your code errors or logic issues.<br>Run your code first to see AI explanations.</p>
    </div>`;

  setStatus("READY", "");
}

// ─── Status helper ────────────────────────────────────────────────────────────
function setStatus(label, type) {
  document.getElementById("status-label").textContent = label;
  const dot = document.querySelector(".status-dot");
  dot.className = "status-dot" + (type ? " " + type : "");
}

// ─── Run Code ─────────────────────────────────────────────────────────────────
async function runCode() {
  const code  = editor.getValue().trim();
  const stdin = document.getElementById("stdin-input").value;
  const btn   = document.getElementById("btn-run");
  const term  = document.getElementById("terminal");
  const outputPanel = document.getElementById("output-panel");

  if (!code) return;

  // Ad interstitial: count every RUN click
  runClickCount++;
  if (runClickCount % INTERSTITIAL_EVERY === 0) {
    showInterstitialAd();
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="run-icon">⟳</span> RUNNING`;
  setStatus("RUNNING", "running");
  outputPanel.className = "io-panel";

  const badge = document.getElementById("output-badge");
  badge.textContent = "…";
  badge.className = "panel-badge";

  term.innerHTML = `
    <div class="t-line t-info">
      <span class="t-gutter">$</span>
      <span class="t-text">Running ${LANGUAGES[currentLang].label} code…<span class="t-cursor"></span></span>
    </div>`;

  try {
    const res = await fetch(JUDGE0, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${JUDGE0_KEY}`
      },
      body: JSON.stringify({
        source_code: code,
        language_id: LANGUAGES[currentLang].id,
        stdin: stdin
      })
    });

    if (!res.ok) throw new Error(`Compiler API error: ${res.status}`);
    const data = await res.json();

    const stdout  = (data.stdout  || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const stderr  = (data.stderr  || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const compile = (data.compile_output || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const isError = !!(stderr || compile);

    let html = "";
    let lineNo = 1;

    const addLines = (text, cls) => {
      if (!text) return;
      text.split("\n").forEach(line => {
        if (line === "" && text.endsWith("\n") && lineNo > 1) return;
        html += `<div class="t-line ${cls}">
          <span class="t-gutter">${lineNo++}</span>
          <span class="t-text">${escapeHtml(line)}</span>
        </div>`;
      });
    };

    addLines(stdout,  "t-stdout");
    addLines(stderr,  "t-stderr");
    addLines(compile, "t-stderr");

    if (!stdout && !stderr && !compile) {
      html += `<div class="t-line t-info">
        <span class="t-gutter">—</span>
        <span class="t-text">No output</span>
      </div>`;
    }

    const exitCls  = isError ? "t-exit-err" : "t-exit-ok";
    const exitIcon = isError ? "✖" : "✔";
    const exitMsg  = isError ? "Process exited with errors" : "Process exited successfully";
    html += `<div class="t-exit-line ${exitCls}">${exitIcon} ${exitMsg}</div>`;

    term.innerHTML = html;
    term.scrollTop = term.scrollHeight;
    outputPanel.className = "io-panel" + (isError ? " has-error" : " has-output");

    lastRunOutput = (stdout + "\n" + stderr + "\n" + compile).trim();

    if (isError) {
      badge.textContent = "ERROR";
      badge.className   = "panel-badge error";
      setStatus("ERROR", "error");
      // Syntax/runtime error: AI catches it automatically, no click needed
      explainError(code, stderr || compile);
    } else {
      badge.textContent = "OK";
      badge.className   = "panel-badge success";
      setStatus("DONE", "");
    }

  } catch (err) {
    term.innerHTML = `<div class="t-line t-stderr">
        <span class="t-gutter">!</span>
        <span class="t-text">⚠ ${escapeHtml(err.message)}</span>
      </div>
      <div class="t-exit-line t-exit-err">✖ Process failed</div>`;
    outputPanel.className = "io-panel has-error";
    badge.textContent = "ERR";
    badge.className   = "panel-badge error";
    setStatus("ERROR", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="run-icon">▶</span> RUN`;
  }
}

// ─── AI Chat helpers ───────────────────────────────────────────────────────────
function clearAiIdle() {
  const idle = document.getElementById("ai-idle-msg");
  if (idle) idle.remove();
}

function scrollChatToBottom() {
  const chat = document.getElementById("ai-chat");
  chat.scrollTop = chat.scrollHeight;
}

function addUserChatBubble(text) {
  clearAiIdle();
  const chat = document.getElementById("ai-chat");
  const el = document.createElement("div");
  el.className = "chat-msg user";
  el.innerHTML = `
    <span class="chat-msg-label">You</span>
    <div class="chat-bubble">${escapeHtml(text)}</div>`;
  chat.appendChild(el);
  scrollChatToBottom();
}

function addAiThinkingBubble() {
  clearAiIdle();
  const chat = document.getElementById("ai-chat");
  const el = document.createElement("div");
  el.className = "chat-msg ai";
  el.id = "ai-thinking-bubble";
  el.innerHTML = `
    <span class="chat-msg-label">AI Assistant</span>
    <div class="chat-bubble">
      <div class="ai-thinking-anim">
        <span>Analyzing</span>
        <div class="ai-thinking-dots"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  chat.appendChild(el);
  scrollChatToBottom();
}

function removeAiThinkingBubble() {
  const el = document.getElementById("ai-thinking-bubble");
  if (el) el.remove();
}

// Renders a structured or raw AI response as a chat bubble
function addAiResponseBubble(text) {
  removeAiThinkingBubble();
  const chat = document.getElementById("ai-chat");
  const el = document.createElement("div");
  el.className = "chat-msg ai";

  const sections = {
    reason:   extractSection(text, "REASON"),
    line:     extractSection(text, "LINE ISSUE"),
    fix:      extractSection(text, "FIX"),
    explain:  extractSection(text, "EXPLANATION"),
    samajh:   extractSection(text, "SAMAJH"),
    hint:     extractSection(text, "HINT"),
    socho:    extractSection(text, "SOCHO"),
  };

  const hasStructure = Object.values(sections).some(Boolean);

  let bodyHtml;
  if (!hasStructure) {
    bodyHtml = `<div class="chat-bubble">${escapeHtml(text)}</div>`;
  } else {
    let inner = `<div class="ai-response">`;
    if (sections.reason)  inner += block("reason",   "⚠ Reason", sections.reason);
    if (sections.samajh)  inner += block("reason",   "🧠 Samajh", sections.samajh);
    if (sections.line)    inner += block("reason",   "📍 Line Issue", sections.line);
    if (sections.fix)     inner += block("fix",      "✓ Suggested Fix", sections.fix);
    if (sections.hint)    inner += block("hint",     "💡 Hint", sections.hint);
    if (sections.explain) inner += block("explain",  "💡 Explanation", sections.explain);
    if (sections.socho)   inner += block("question", "🤔 Socho...", sections.socho);
    inner += `</div>`;
    bodyHtml = `<div class="chat-bubble">${inner}</div>`;
  }

  el.innerHTML = `<span class="chat-msg-label">AI Assistant</span>${bodyHtml}`;
  chat.appendChild(el);
  scrollChatToBottom();

  function block(cls, label, body) {
    return `<div class="ai-block ${cls}">
      <div class="ai-block-label">${label}</div>
      <div class="ai-block-body">${escapeHtml(body)}</div>
    </div>`;
  }
}

function addErrorChatBubble(message) {
  removeAiThinkingBubble();
  const chat = document.getElementById("ai-chat");
  const el = document.createElement("div");
  el.className = "chat-msg ai";
  el.innerHTML = `
    <span class="chat-msg-label">AI Assistant</span>
    <div class="chat-bubble" style="color: var(--red);">⚠️ ${escapeHtml(message)}</div>`;
  chat.appendChild(el);
  scrollChatToBottom();
}

// ─── AI Error Explanation (automatic, on syntax/runtime error) ────────────────
async function explainError(code, errorMsg) {
  const aiBadge = document.getElementById("ai-badge");

  addAiThinkingBubble();
  aiBadge.textContent = "THINKING";
  aiBadge.className = "panel-badge ai-thinking";

  try {
    const res = await fetch(AI_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code,
        error: errorMsg,
        language: currentLang,
        user_id: "debug_user_001"
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Backend error (${res.status}): ${errorData.detail || res.statusText}`);
    }

    const data = await res.json();
    const aiText = data?.data?.[0] || data?.output || data?.response || data?.text || "";
    if (!aiText) throw new Error("Empty response from AI");

    addAiResponseBubble(aiText);
    chatHistory.push({ role: "ai", text: aiText });
    aiBadge.textContent = "DONE";
    aiBadge.className = "panel-badge success";

  } catch (err) {
    addErrorChatBubble(`AI Error: ${err.message}`);
    aiBadge.textContent = "FAILED";
    aiBadge.className = "panel-badge error";
  }
}

// ─── AI Chat — logic errors & general follow-up questions ────────────────────
// The user types a message (e.g. "Sum sahi nahi ho raha hai"). We always send
// the FULL current editor code + last run output as context, so the user never
// has to copy-paste code themselves.
document.getElementById("ai-chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

async function sendChatMessage() {
  const input = document.getElementById("ai-chat-input");
  const userMsg = input.value.trim();
  if (!userMsg) {
    input.focus();
    return;
  }
  if (!editor) return;

  const code = editor.getValue().trim();
  const aiBadge = document.getElementById("ai-badge");
  const sendBtn = document.getElementById("btn-send");

  addUserChatBubble(userMsg);
  chatHistory.push({ role: "user", text: userMsg });
  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;

  const prompt = `[LOGIC / FOLLOW-UP DEBUG REQUEST]

Language: ${currentLang}

--- Current Code (full editor contents) ---
${code}

--- Last Program Output ---
${lastRunOutput || "(not run yet)"}

--- User's Message ---
${userMsg}

--- Your Task ---
You are a friendly, encouraging coding assistant (bhaiya/didi style, Hinglish ok if the
user writes in Hinglish, otherwise match their language).
The code may run fine but give the wrong output, or the user may just be asking a
follow-up question about their code.

RULES:
1. If this looks like a logic bug (wrong output, not a crash), DO NOT give the fixed
   code directly — guide them with a hint instead, using this structure:
SAMAJH: [1-2 lines: what the code is doing vs what user wanted]
HINT: [one clear clue about which part of the logic is wrong — no full solution]
SOCHO: [one guiding question to push their thinking]
2. If it's a general question about the code, answer directly and concisely using:
EXPLANATION: [clear, concise answer]
3. Keep it short and friendly.`;

  addAiThinkingBubble();
  aiBadge.textContent = "THINKING";
  aiBadge.className = "panel-badge ai-thinking";

  try {
    const res = await fetch(AI_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code,
        error: prompt,
        language: currentLang,
        user_id: "logic_debug_user"
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Backend error (${res.status}): ${errData.detail || res.statusText}`);
    }

    const data = await res.json();
    const aiText = data?.data?.[0] || data?.output || data?.response || data?.text || "";
    if (!aiText) throw new Error("Empty response from AI");

    addAiResponseBubble(aiText);
    chatHistory.push({ role: "ai", text: aiText });
    aiBadge.textContent = "DONE";
    aiBadge.className = "panel-badge success";

  } catch (err) {
    addErrorChatBubble(`Couldn't reach the AI: ${err.message}. Try again in a bit.`);
    aiBadge.textContent = "FAILED";
    aiBadge.className = "panel-badge error";
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// ─── Interstitial ad (every 5th RUN click) ─────────────────────────────────────
// Fires on the 5th, 10th, 15th... RUN click (runClickCount % 5 === 0, see above).
// This only toggles the overlay's visibility — it does not block or await
// anything, so the code run already in flight continues normally whether or
// not the user closes the ad.
function showInterstitialAd() {
  const overlay = document.getElementById("interstitial-overlay");
  overlay.classList.add("visible");
}
document.getElementById("interstitial-close").addEventListener("click", () => {
  document.getElementById("interstitial-overlay").classList.remove("visible");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractSection(text, label) {
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}