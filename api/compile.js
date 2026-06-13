const fetch = require('node-fetch');

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
        // वर्सेल में बॉडी सीधे req.body में मिल जाती है, JSON.parse करने की ज़रूरत नहीं होती
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

        const data = await response.json();
        
        // वर्सेल का सही रिस्पॉन्स फॉरमैट
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: error.toString() });
    }
}