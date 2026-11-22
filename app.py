from flask import Flask, request, jsonify, send_from_directory
from google import genai
from dotenv import load_dotenv
import os
import re

load_dotenv()
app = Flask(__name__)

api_key = os.getenv("GEMINI_API_KEY", "").strip()
client = genai.Client(api_key=api_key) if api_key else None

AI_CONFIG = {
    "system_instruction": (
        "You are RDX AI, created by Fahad Ashraf. "
        "Give helpful, accurate and clear answers. "
        "Use simple language and keep simple answers concise."
    )
}

# Primary model plus a backup model.
MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]

@app.route("/")
def home():
    return send_from_directory(app.root_path, "index.html")

@app.route("/style.css")
def stylesheet():
    return send_from_directory(app.root_path, "style.css", mimetype="text/css")

@app.route("/script.js")
def javascript():
    return send_from_directory(app.root_path, "script.js", mimetype="application/javascript")

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({"error": "Message is empty"}), 400

    if client is None:
        return jsonify({
            "error": "GEMINI_API_KEY is missing. Check your .env file."
        }), 503

    errors = []
    for model_name in MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=message,
                config=AI_CONFIG
            )
            if response.text:
                return jsonify({"reply": response.text, "model": model_name})
            errors.append(f"{model_name}: Gemini returned an empty response.")
        except Exception as exc:
            # Do not expose any possible credential-like strings to the browser.
            detail = str(exc)
            detail = re.sub(r"(?i)(key=)[^&\s]+", r"\1[hidden]", detail)
            detail = re.sub(r"AIza[0-9A-Za-z_-]{20,}", "[hidden API key]", detail)
            errors.append(f"{model_name}: {detail}")
            app.logger.exception("Gemini request failed for %s", model_name)

    return jsonify({
        "error": "Both Gemini model attempts failed. Check the details below.",
        "details": errors
    }), 503

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
