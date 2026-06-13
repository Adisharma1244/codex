/**
 * CompileX Interactive Terminal Server
 * -------------------------------------
 * Runs user code as a real child process.
 * Browser connects via WebSocket → sends stdin keystrokes in real-time
 * → receives stdout/stderr back in real-time → Xterm.js displays it.
 *
 * Supports: Python, C++, Java, JavaScript
 *
 * Start with: node server.js
 * Default port: 3001  (set PORT env var to override)
 */

const http       = require("http");
const fs         = require("fs");
const path       = require("path");
const os         = require("os");
const { spawn }  = require("child_process");
const WebSocket  = require("ws");

const PORT = process.env.PORT || 3001;

// ─── Static file server (serves index.html, style.css, scripit.js) ───────────
const MIME = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "text/javascript",
  ".ico":  "image/x-icon",
};

const httpServer = http.createServer((req, res) => {
  // Resolve the requested file — default to index.html
  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
});

// ─── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server: httpServer });

// Active sessions: wsId → { process, tmpDir }
const sessions = new Map();
let nextId = 1;

wss.on("connection", (ws) => {
  const id = nextId++;
  console.log(`[${id}] Client connected`);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "run") {
      handleRun(id, ws, msg);
    } else if (msg.type === "stdin") {
      // Keystroke from terminal → forward to running process
      const session = sessions.get(id);
      if (session && session.proc && !session.proc.killed) {
        session.proc.stdin.write(msg.data);
      }
    } else if (msg.type === "kill") {
      killSession(id);
    } else if (msg.type === "resize") {
      // future: handle terminal resize
    }
  });

  ws.on("close", () => {
    console.log(`[${id}] Client disconnected`);
    killSession(id);
  });
});

// ─── Run a code session ───────────────────────────────────────────────────────
async function handleRun(id, ws, msg) {
  // Kill any existing session for this client
  killSession(id);

  const { language, code } = msg;

  // Write source to a temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compilex-"));
  let srcFile, runCmd, runArgs, needsCompile = false, compileCmd, compileArgs;

  try {
    switch (language) {
      case "python":
        srcFile = path.join(tmpDir, "main.py");
        fs.writeFileSync(srcFile, code);
        runCmd  = "python3";
        runArgs = ["-u", srcFile];   // -u = unbuffered (so output appears immediately)
        break;

      case "javascript":
        srcFile = path.join(tmpDir, "main.js");
        fs.writeFileSync(srcFile, code);
        runCmd  = "node";
        runArgs = [srcFile];
        break;

      case "cpp": {
        srcFile = path.join(tmpDir, "main.cpp");
        const outFile = path.join(tmpDir, "main");
        fs.writeFileSync(srcFile, code);
        needsCompile = true;
        compileCmd  = "g++";
        compileArgs = ["-o", outFile, srcFile, "-std=c++17"];
        runCmd  = outFile;
        runArgs = [];
        break;
      }

      case "java": {
        // Extract public class name from code
        const classMatch = code.match(/public\s+class\s+(\w+)/);
        const className  = classMatch ? classMatch[1] : "Main";
        srcFile = path.join(tmpDir, `${className}.java`);
        fs.writeFileSync(srcFile, code);
        needsCompile = true;
        compileCmd  = process.env.JAVAC_PATH || "javac";
        compileArgs = [srcFile];
        runCmd  = process.env.JAVA_PATH || "java";
        runArgs = ["-cp", tmpDir, className];
        break;
      }

      default:
        send(ws, { type: "error", data: `Unsupported language: ${language}` });
        return;
    }

    send(ws, { type: "status", status: "compiling" });

    // ── Compile step (C++, Java) ───────────────────────────────────────────────
    if (needsCompile) {
      const compileResult = await runCompile(compileCmd, compileArgs, tmpDir);
      if (compileResult.stderr) {
        send(ws, { type: "output", stream: "stderr", data: compileResult.stderr });
      }
      if (compileResult.code !== 0) {
        send(ws, { type: "exit", code: compileResult.code });
        cleanup(tmpDir);
        return;
      }
    }

    // ── Spawn the actual process ───────────────────────────────────────────────
    send(ws, { type: "status", status: "running" });

    const proc = spawn(runCmd, runArgs, {
      cwd: tmpDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8", JAVA_TOOL_OPTIONS: "" },
    });

    sessions.set(id, { proc, tmpDir });

    // stdout → browser
    proc.stdout.on("data", (chunk) => {
      send(ws, { type: "output", stream: "stdout", data: chunk.toString() });
    });

    // stderr → browser
    proc.stderr.on("data", (chunk) => {
      send(ws, { type: "output", stream: "stderr", data: chunk.toString() });
    });

    proc.on("error", (err) => {
      send(ws, { type: "output", stream: "stderr", data: `\r\nProcess error: ${err.message}\r\n` });
      send(ws, { type: "exit", code: 1 });
      cleanup(tmpDir);
      sessions.delete(id);
    });

    proc.on("close", (code) => {
      send(ws, { type: "exit", code: code ?? 0 });
      cleanup(tmpDir);
      sessions.delete(id);
    });

    // Safety timeout: kill after 30 seconds
    setTimeout(() => {
      const s = sessions.get(id);
      if (s && s.proc === proc && !proc.killed) {
        proc.kill("SIGKILL");
        send(ws, { type: "output", stream: "stderr", data: "\r\n⏱  Killed: execution exceeded 30 seconds\r\n" });
      }
    }, 30_000);

  } catch (err) {
    send(ws, { type: "error", data: err.message });
    cleanup(tmpDir);
  }
}

// ─── Compile helper (returns { code, stderr }) ────────────────────────────────
function runCompile(cmd, args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stdout.on("data", d => { stderr += d.toString(); }); // some compilers use stdout
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", code => resolve({ code, stderr }));
    proc.on("error", err => resolve({ code: 1, stderr: err.message }));
  });
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
function killSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  try { if (!s.proc.killed) s.proc.kill("SIGKILL"); } catch {}
  cleanup(s.tmpDir);
  sessions.delete(id);
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n  CompileX server running → http://localhost:${5500}\n`);
});
