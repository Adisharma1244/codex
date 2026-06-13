// ── FIX: Use ES module import, not CommonJS require ──
// This file uses `export default`, so all imports must use `import` too.
// Make sure your package.json has "type": "module"
// OR rename this file to compile.mjs
import fetch from 'node-fetch';

export default async function handler(req, res) {

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Vercel automatically parses the JSON body into req.body
        const bodyData = req.body;

        const response = await fetch('https://judge0-extra-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-key': process.env.JUDGE0_API_KEY,
                'x-rapidapi-host': 'judge0-extra-ce.p.rapidapi.com'
            },
            body: JSON.stringify(bodyData)
        });

        // ── FIX: Forward Judge0 errors properly instead of swallowing them ──
        // Previously, if Judge0 returned a non-200, the error was lost and the
        // frontend received an empty 200 response with no output to render.
        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: `Judge0 error: ${errText}` });
        }

        const data = await response.json();

        // Return Judge0's full response to the frontend
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: error.toString() });
    }
}