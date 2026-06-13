import fetch from 'node-fetch';

// ── Language name map: frontend lang key → OneCompiler language string ──
// OneCompiler uses its own language identifiers, not numeric IDs like Judge0.
const LANG_MAP = {
  python:     "python",
  java:       "java",
  cpp:        "cpp",
  javascript: "nodejs",   // OneCompiler runs JS via Node.js
};

// ── File name map: what to name the source file for each language ──
const FILE_NAME_MAP = {
  python:     "main.py",
  java:       "Main.java",
  cpp:        "main.cpp",
  javascript: "index.js",
};

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // ── req.body is already parsed by Vercel (JSON body parser is on by default) ──
    const { source_code, language_id, stdin, language } = req.body;

    // Accept either a language string (e.g. "python") from the frontend
    // or fall back to a numeric id→string lookup if the frontend still sends language_id.
    // Our updated frontend sends `language` as a string key (java/python/cpp/javascript).
    const langKey = language || (() => {
      // Reverse-map numeric Judge0 IDs to our keys, just in case old requests come in
      const idMap = { 62: "java", 71: "python", 54: "cpp", 63: "javascript" };
      return idMap[language_id] || null;
    })();

    if (!langKey || !LANG_MAP[langKey]) {
      return res.status(400).json({ error: `Unsupported language: ${langKey}` });
    }

    const oneCompilerLang = LANG_MAP[langKey];
    const fileName        = FILE_NAME_MAP[langKey];

    // ── Build the OneCompiler API request ──
    // Endpoint: POST https://api.onecompiler.com/v1/run
    // Auth:     X-API-Key header
    // Body:     { language, stdin, files: [{ name, content }] }
    const payload = {
      language: oneCompilerLang,
      stdin:    stdin || "",
      files: [
        {
          name:    fileName,
          content: source_code,
        }
      ]
    };

    const response = await fetch("https://api.onecompiler.com/v1/run", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key":    process.env.ONECOMPILER_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `OneCompiler error: ${errText}` });
    }

    const data = await response.json();

    // ── OneCompiler response shape:
    // {
    //   status:          "success" | "failed",
    //   stdout:          "Hello World\n"  | null,
    //   stderr:          null | "error text",
    //   exception:       null | "exception text",
    //   executionTime:   9,
    //   compilationTime: 0,
    //   memoryUsed:      9384,
    //   limitRemaining:  99
    // }
    //
    // Our frontend reads: data.stdout, data.stderr, data.compile_output
    // Map OneCompiler's `exception` → compile_output so compile errors surface correctly.

    const normalized = {
      stdout:         data.stdout         || "",
      stderr:         data.stderr         || "",
      compile_output: data.exception      || "",   // compile/runtime exceptions
      status: {
        // Mimic a Judge0-style status so the frontend isError logic still works.
        // "failed" from OneCompiler covers API errors, quota exceeded, bad language, etc.
        id:          data.status === "success" ? 3 : 11,
        description: data.status === "success" ? "Accepted" : "Runtime Error",
      },
      // Pass through useful metadata (ignored by frontend, handy for debugging)
      executionTime:   data.executionTime,
      limitRemaining:  data.limitRemaining,
    };

    return res.status(200).json(normalized);

  } catch (error) {
    return res.status(500).json({ error: error.toString() });
  }
}