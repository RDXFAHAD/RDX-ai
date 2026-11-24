RDX AI — Fast & Safe Error Handling Update

Included files:
- index.html: latest saved RDX AI interface
- style.css: latest saved RDX AI design
- script.js: hides raw error details in the chat, adds a 45-second request timeout, preserves chat history/voice/settings
- app.py: server-side Gemini model fallback, one short retry after temporary failures, generic public errors
- requirements.txt: Python dependencies

Setup:
1. Back up your current project folder.
2. Replace the matching project files with these files.
3. Keep your existing .env file in the project root. Do NOT put your API key in frontend files or share it.
4. Install dependencies with: pip install -r requirements.txt
5. Start the Flask app using your existing deployment/start command.

Important:
- The .env file and API key are deliberately NOT included in this ZIP.
- The configured Gemini model names are retained from your current backend. Confirm that these model IDs are enabled for your Google API key.
- Faster UI handling cannot make Google's servers respond faster; model/provider availability still affects latency.
- Technical diagnostics stay in server logs for the project owner; visitors receive only a short friendly message.
