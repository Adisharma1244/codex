// ─── Config ───────────────────────────────────────────────────────────────────
const AI_API = "https://adisharm4988-easydebuger.hf.space/api/explain-error";
const JUDGE0   = "/api/compile";

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
  resetPanels();
});

function resetPanels() {
  const term = document.getElementById("terminal");
  term.innerHTML = `
    <div class="terminal-idle">
      <span class="terminal-prompt">▶</span>
      <span class="terminal-idle-text">Click <strong>RUN</strong> to execute your code…</span>
    </div>`;
  document.getElementById("terminal-wrap").className = "terminal-wrap";

  const ai = document.getElementById("ai");
  ai.innerHTML = `
    <div class="ai-idle">
      <div class="ai-icon">⬡</div>
      <p>AI will explain errors and suggest fixes when your code fails.</p>
    </div>`;

  document.getElementById("output-badge").textContent = "—";
  document.getElementById("output-badge").className = "panel-badge";
  document.getElementById("ai-badge").textContent = "—";
  document.getElementById("ai-badge").className = "panel-badge ai-badge";
  document.getElementById("panel-ai").className = "panel";
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
  const code = editor.getValue().trim();
  const btn  = document.getElementById("btn-run");
  const term = document.getElementById("terminal");
  const wrap = document.getElementById("terminal-wrap");

  if (!code) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="run-icon">⟳</span> RUNNING`;
  setStatus("RUNNING", "running");
  wrap.className = "terminal-wrap";

  const badge = document.getElementById("output-badge");
  badge.textContent = "…";
  badge.className = "panel-badge";

  term.innerHTML = `
    <div class="t-line t-info">
      <span class="t-gutter">$</span>
      <span class="t-text">Running ${LANGUAGES[currentLang].label} code…<span class="t-cursor"></span></span>
    </div>`;

  document.getElementById("ai").innerHTML = `
    <div class="ai-idle">
      <div class="ai-icon">⬡</div>
      <p>AI will explain errors and suggest fixes when your code fails.</p>
    </div>`;
  document.getElementById("ai-badge").textContent = "—";
  document.getElementById("ai-badge").className = "panel-badge ai-badge";
  document.getElementById("panel-ai").className = "panel";

  try {
    const res = await fetch(JUDGE0, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: LANGUAGES[currentLang].id,
        stdin: document.getElementById("stdin-input").value || ""
      })
    });

    if (!res.ok) throw new Error(`Compiler API error: ${res.status}`);
    const data = await res.json();

    // ── FIX: Handle Judge0 execution-level errors (TLE, Runtime Error, etc.) ──
    // Judge0 status id > 3 means something went wrong:
    // 4 = Wrong Answer, 5 = Time Limit Exceeded, 6 = Compile Error,
    // 7-12 = Runtime Errors, etc.
    if (data.status && data.status.id > 3) {
      const statusDesc = data.status.description || "Execution Error";
      // Treat the status description as a stderr message if no other error output exists
      if (!data.stderr && !data.compile_output) {
        data.stderr = `[${statusDesc}]`;
      }
    }

    const stdout  = (data.stdout  || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const stderr  = (data.stderr  || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const compile = (data.compile_output || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const isError = !!(stderr || compile);

    // ── Build terminal lines ──────────────────────────────────────────────────
    let html = "";
    let lineNo = 1;

    // ── FIX: Only strip the single trailing empty string caused by a final \n ──
    // The old code skipped ALL empty lines when text ended with \n, which could
    // swallow real blank lines in the middle of output.
    const addLines = (text, cls) => {
      if (!text) return;
      const lines = text.split("\n");
      // Remove only the last element if it's an empty string from a trailing newline
      if (lines[lines.length - 1] === "") lines.pop();
      lines.forEach(line => {
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
    wrap.className = "terminal-wrap" + (isError ? " has-error" : " has-output");

    if (isError) {
      badge.textContent = "ERROR";
      badge.className   = "panel-badge error";
      setStatus("ERROR", "error");
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
    wrap.className = "terminal-wrap has-error";
    badge.textContent = "ERR";
    badge.className   = "panel-badge error";
    setStatus("ERROR", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="run-icon">▶</span> RUN`;
  }
}

// ─── AI Error Explanation ─────────────────────────────────────────────────────
async function explainError(code, errorMsg) {
  const aiPanel = document.getElementById("ai");
  const aiBadge = document.getElementById("ai-badge");

  aiPanel.innerHTML = `
    <div class="ai-thinking-anim">
      <span>AI analyzing</span>
      <div class="ai-thinking-dots">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  aiBadge.textContent = "THINKING";
  aiBadge.className = "panel-badge ai-thinking";

  try {
    const res = await fetch(AI_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code:     code,
        error:    errorMsg,
        language: currentLang,
        user_id:  "debug_user_001"
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(`Backend error (${res.status}): ${errorData.detail || res.statusText}`);
    }

    const data = await res.json();
    const aiText = data?.data?.[0] || data?.output || data?.response || data?.text || "";

    if (!aiText) throw new Error("Empty response from AI");

    renderAIResponse(aiText);
    aiBadge.textContent = "DONE";
    aiBadge.className = "panel-badge success";

  } catch (err) {
    aiPanel.innerHTML = `
      <div style="color: var(--red); padding: 16px; font-size: 12px; line-height: 1.6;">
        <strong>⚠️ AI Error:</strong> ${escapeHtml(err.message)}
        <br><br>
        <strong>Troubleshooting:</strong>
        <br>1. Make sure backend is running on: ${AI_API}
        <br>2. Check that GROQ_API_KEY is set in .env
        <br>3. Verify backend is accessible from frontend domain
      </div>`;
    aiBadge.textContent = "FAILED";
    aiBadge.className = "panel-badge error";
  }
}

// ─── Render AI Response ───────────────────────────────────────────────────────
function renderAIResponse(text) {
  const aiPanel = document.getElementById("ai");

  const sections = {
    reason:  extract(text, "REASON"),
    line:    extract(text, "LINE ISSUE"),
    fix:     extract(text, "FIX"),
    explain: extract(text, "EXPLANATION")
  };

  const hasStructure = sections.reason || sections.fix || sections.explain;

  if (!hasStructure) {
    aiPanel.innerHTML = `<div class="ai-response">
      <div class="ai-block explain">
        <div class="ai-block-label">AI Response</div>
        <div class="ai-block-body">${escapeHtml(text)}</div>
      </div>
    </div>`;
    return;
  }

  let html = `<div class="ai-response">`;

  if (sections.reason) {
    html += `<div class="ai-block reason">
      <div class="ai-block-label">⚠ Reason</div>
      <div class="ai-block-body">${escapeHtml(sections.reason)}</div>
    </div>`;
  }
  if (sections.line) {
    html += `<div class="ai-block reason">
      <div class="ai-block-label">📍 Line Issue</div>
      <div class="ai-block-body">${escapeHtml(sections.line)}</div>
    </div>`;
  }
  if (sections.fix) {
    html += `<div class="ai-block fix">
      <div class="ai-block-label">✓ Suggested Fix</div>
      <div class="ai-block-body">${escapeHtml(sections.fix)}</div>
    </div>`;
  }
  if (sections.explain) {
    html += `<div class="ai-block explain">
      <div class="ai-block-label">💡 Explanation</div>
      <div class="ai-block-body">${escapeHtml(sections.explain)}</div>
    </div>`;
  }

  html += `</div>`;
  aiPanel.innerHTML = html;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extract(text, label) {
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, "i");
  const match   = text.match(pattern);
  return match ? match[1].trim() : "";
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── "Bhai, Output Galat Hai!" — Logic Debugger ───────────────────────────────
let bhaiCooldownActive = false;
let bhaiCooldownInterval = null;

document.getElementById("bhai-goal").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !bhaiCooldownActive) logicDebug();
});

async function logicDebug() {
  if (bhaiCooldownActive) return;

  const code         = editor.getValue().trim();
  const language     = currentLang;
  const actualOutput = Array.from(document.querySelectorAll("#terminal .t-stdout .t-text, #terminal .t-stderr .t-text"))
    .map(el => el.textContent).join("\n").trim();
  const userGoal     = document.getElementById("bhai-goal").value.trim();

  if (!userGoal) {
    document.getElementById("bhai-goal").focus();
    showBhaiResult("warn", "⚠️ Pehle apna goal likho bhai — kya chahiye tha output mein?");
    return;
  }
  if (!code) {
    showBhaiResult("warn", "⚠️ Editor mein kuch code toh likho pehle!");
    return;
  }

  const prompt = `[LOGIC DEBUG REQUEST — Not a syntax error]

Language: ${language}

--- User's Code ---
${code}

--- Actual Output (what the code printed) ---
${actualOutput || "(no output / not run yet)"}

--- What the Student Wanted ---
${userGoal}

--- Your Task ---
You are a friendly college senior (bhaiya/didi) helping a junior find a LOGIC bug — NOT a syntax error.
The code runs fine but gives the wrong output.

RULES:
1. Reply in Hinglish (mix of Hindi + English), warm and encouraging tone.
2. DO  give the corrected code directly — guide them why this happning.
3. Use this exact structure:

SAMAJH: [In 1-2 lines, explain what the code is actually doing vs what student wanted — simple Hinglish]
HINT: [One clear clue about which part of the logic is wrong — loop condition? index? operator? — no spoilers]
SOCHO: [Ask them one guiding question to push their thinking AND INDICATE TO THE PROBLUME,]

Keep it short, friendly, and do write the fix and so the main fix show the line and fix.`;

  const btn = document.getElementById("btn-bhai");
  btn.disabled = true;
  document.getElementById("btn-bhai-text").textContent = "Thinking...";
  showBhaiResult("thinking", "");

  try {
    const res = await fetch(AI_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code:     code,
        error:    prompt,
        language: language,
        user_id:  "logic_debug_user"
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Backend error (${res.status}): ${errData.detail || res.statusText}`);
    }

    const data   = await res.json();
    const aiText = data?.data?.[0] || data?.output || data?.response || data?.text || "";
    if (!aiText) throw new Error("Empty response from AI");

    renderBhaiResponse(aiText);
    startBhaiCooldown(45);

  } catch (err) {
    showBhaiResult("error", `⚠️ AI se baat nahi ho payi: ${escapeHtml(err.message)}\n\nThodi der baad try karo.`);
    btn.disabled = false;
    document.getElementById("btn-bhai-text").textContent = "Debug Logic";
  }
}

// ── Render the structured Bhai AI response ────────────────────────────────────
function renderBhaiResponse(text) {
  const samajh = extractBhai(text, "SAMAJH");
  const hint   = extractBhai(text, "HINT");
  const socho  = extractBhai(text, "SOCHO");

  const hasStructure = samajh || hint || socho;

  if (!hasStructure) {
    showBhaiResult("success", text);
    return;
  }

  const result = document.getElementById("bhai-result");
  let html = `<div class="bhai-blocks">`;

  if (samajh) html += `
    <div class="bhai-block bhai-samajh">
      <div class="bhai-block-label">🧠 Samajh</div>
      <div class="bhai-block-body">${escapeHtml(samajh)}</div>
    </div>`;

  if (hint) html += `
    <div class="bhai-block bhai-hint">
      <div class="bhai-block-label">💡 Hint</div>
      <div class="bhai-block-body">${escapeHtml(hint)}</div>
    </div>`;

  if (socho) html += `
    <div class="bhai-block bhai-socho">
      <div class="bhai-block-label">🤔 Socho...</div>
      <div class="bhai-block-body">${escapeHtml(socho)}</div>
    </div>`;

  html += `</div>`;
  result.innerHTML = html;
}

// ── Helper: show simple state messages inside bhai-result ─────────────────────
function showBhaiResult(type, message) {
  const result = document.getElementById("bhai-result");

  if (type === "thinking") {
    result.innerHTML = `
      <div class="bhai-thinking">
        <span>AI soch raha hai</span>
        <div class="ai-thinking-dots">
          <span></span><span></span><span></span>
        </div>
      </div>`;
    return;
  }

  const colorMap = { warn: "var(--yellow)", error: "var(--red)", success: "var(--text)" };
  result.innerHTML = `
    <div style="padding: 14px 16px; font-size: 12.5px; line-height: 1.7;
                color: ${colorMap[type] || "var(--text)"}; white-space: pre-wrap;">
      ${escapeHtml(message)}
    </div>`;
}

// ── Extract a section from the structured Bhai response ───────────────────────
function extractBhai(text, label) {
  const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, "i");
  const match   = text.match(pattern);
  return match ? match[1].trim() : "";
}

// ── 45-second cooldown ────────────────────────────────────────────────────────
function startBhaiCooldown(seconds) {
  bhaiCooldownActive = true;

  const btn       = document.getElementById("btn-bhai");
  const timerEl   = document.getElementById("bhai-cooldown-timer");
  const wrapEl    = document.getElementById("bhai-cooldown-wrap");
  const goalInput = document.getElementById("bhai-goal");

  btn.disabled       = true;
  goalInput.disabled = true;
  wrapEl.classList.add("visible");
  document.getElementById("btn-bhai-text").textContent = "Cooldown...";

  let remaining = seconds;
  timerEl.textContent = remaining;

  bhaiCooldownInterval = setInterval(() => {
    remaining--;
    timerEl.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(bhaiCooldownInterval);
      bhaiCooldownActive   = false;
      btn.disabled         = false;
      goalInput.disabled   = false;
      wrapEl.classList.remove("visible");
      document.getElementById("btn-bhai-text").textContent = "Debug Logic";
    }
  }, 1000);
}