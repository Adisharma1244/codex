"""
Codex AI Debugger Backend - Production Ready
All configuration from environment variables (.env)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv

# ─── Load Environment Variables ──────────────────────────────────────────────
load_dotenv()

# ─── Get All Configuration from .env ─────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")
JUDGE0_KEY = os.getenv("JUDGE0_KEY", "oc_44pcrgpbc_44pcrgpbx_cebc37feecdf44af59870fbfd6ba252340f946be41cb4a8a")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

# ─── Validate Configuration ──────────────────────────────────────────────────
if not GROQ_API_KEY:
    print("⚠️  WARNING: GROQ_API_KEY not found in .env")
    print("   AI features will not work without it!")
else:
    print("✅ GROQ_API_KEY loaded from .env")

# ─── FastAPI App ────────────────────────────────────────────────────────────
app = FastAPI(
    title="Codex AI Debugger",
    description="AI-powered code compiler with Groq",
    version="1.0.0"
)

# ─── CORS Middleware ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request Models ─────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    """Chat request model"""
    user_id: str = "debug_user_001"
    gender: str = "male"
    message: str


class ErrorExplanationRequest(BaseModel):
    """Error explanation request model"""
    code: str
    error: str
    language: str = "python"
    user_id: str = "debug_user_001"


# ─── Groq API Call ──────────────────────────────────────────────────────────
async def call_groq_api(prompt: str) -> str:
    """
    Call Groq API to get error explanation
    Uses GROQ_API_KEY and GROQ_API_URL from .env
    """
    if not GROQ_API_KEY:
        return "❌ Error: GROQ_API_KEY not configured. Add it to .env file."
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": "mixtral-8x7b-32768",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.7,
        "max_tokens": 1024,
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(GROQ_API_URL, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Groq API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ─── Error Explanation Logic ────────────────────────────────────────────────
async def explain_code_error(code: str, error: str, language: str) -> str:
    """Generate error explanation using Groq"""
    
    prompt = f"""You are an expert coding tutor and debugger who explains errors in Hinglish (mix of Hindi and English).

Your job is to help students understand coding errors clearly.

RULES:
- Explain in simple Hinglish (Hindi + English mix)
- Use simple words that a beginner can understand
- Be short and clear
- Focus only on the error, not theory
- Format your response with these sections:

REASON:
(Why did this error happen? 1-2 lines)

FIX:
(How to fix it? Show the corrected code if needed)

EXPLANATION:
(Simple explanation like teaching a beginner)

---

LANGUAGE: {language}

CODE:
```
{code}
```

ERROR MESSAGE:
{error}

Now explain this error in Hinglish:"""

    try:
        response = await call_groq_api(prompt)
        return response
    except Exception as e:
        return f"Error explanation failed: {str(e)}"


# ─── API Routes ──────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    """Root endpoint - API info"""
    return {
        "name": "Codex AI Debugger Backend",
        "version": "1.0.0",
        "description": "AI-powered code compiler with Groq API",
        "endpoints": {
            "health": "/api/health",
            "chat": "/api/chat (POST)",
            "explain_error": "/api/explain-error (POST)",
            "config": "/api/config"
        },
        "docs": "/docs"
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    groq_configured = bool(GROQ_API_KEY)
    return {
        "status": "ok",
        "service": "Codex AI Debugger",
        "model": "Groq Mixtral-8x7b",
        "version": "1.0.0",
        "groq_api_configured": groq_configured
    }


@app.get("/api/config")
async def get_config():
    """Get configuration (non-sensitive)"""
    return {
        "groq_api_url": GROQ_API_URL,
        "judge0_api_key_set": bool(JUDGE0_KEY),
        "cors_origins": CORS_ORIGINS,
        "debug": DEBUG,
        "ai_enabled": bool(GROQ_API_KEY)
    }


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Chat endpoint for AI explanation
    
    Request:
    ```json
    {
        "user_id": "user_123",
        "gender": "male",
        "message": "Explain this error..."
    }
    ```
    
    Response:
    ```json
    {
        "user_id": "user_123",
        "gender": "male",
        "output": "REASON: ...",
        "data": ["REASON: ..."]
    }
    ```
    """
    if not request.message:
        raise HTTPException(status_code=400, detail="Message is required")
    
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. GROQ_API_KEY missing."
        )
    
    try:
        response = await call_groq_api(request.message)
        return {
            "user_id": request.user_id,
            "gender": request.gender,
            "output": response,
            "data": [response]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/explain-error")
async def explain_error(request: ErrorExplanationRequest):
    """
    Explain a code error using Groq API
    
    Request:
    ```json
    {
        "code": "print(x)",
        "error": "NameError: name 'x' is not defined",
        "language": "python",
        "user_id": "user_123"
    }
    ```
    """
    if not request.code or not request.error:
        raise HTTPException(status_code=400, detail="Code and error are required")
    
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. GROQ_API_KEY missing."
        )
    
    explanation = await explain_code_error(
        request.code,
        request.error,
        request.language
    )
    
    return {
        "user_id": request.user_id,
        "language": request.language,
        "output": explanation,
        "data": [explanation]
    }


# ─── Serve Frontend ──────────────────────────────────────────────────────────

@app.get("/index.html")
async def serve_index():
    """Serve index.html if it exists"""
    if os.path.exists("public/index.html"):
        return FileResponse("public/index.html", media_type="text/html")
    return {"error": "Frontend not found"}


@app.get("/favicon.ico")
async def favicon():
    """Serve favicon if it exists"""
    if os.path.exists("public/favicon.ico"):
        return FileResponse("public/favicon.ico", media_type="image/x-icon")
    return {"error": "Favicon not found"}


# ─── Run Server ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    
    print(f"""
    ╔════════════════════════════════════════════╗
    ║   Codex AI Debugger - Starting Server      ║
    ╠════════════════════════════════════════════╣
    ║ Host: {HOST}
    ║ Port: {PORT}
    ║ Debug: {DEBUG}
    ║ CORS Origins: {', '.join(CORS_ORIGINS)}
    ║ Groq API: {'✅ Configured' if GROQ_API_KEY else '❌ Not Configured'}
    ╠════════════════════════════════════════════╣
    ║ API: http://{HOST}:{PORT}/docs
    ║ Health: http://{HOST}:{PORT}/api/health
    ╚════════════════════════════════════════════╝
    """)
    
    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        reload=DEBUG,
        log_level="info"
    )