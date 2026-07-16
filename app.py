import os
import secrets
import socket

from dotenv import load_dotenv
from flask import (
    Flask, render_template, request, jsonify,
    session, redirect, url_for,
)

from analyzer import extract_document_text, analyze_document, chat_about_document, AnalyzerError

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 800 * 1024 * 1024  # 800MB total upload cap
# Falls back to a random key if unset, which just means everyone is logged
# out whenever the server restarts — fine for local use, but set
# FLASK_SECRET_KEY in .env for a stable session across restarts.
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)

APP_PASSWORD = os.environ.get("APP_PASSWORD")


@app.before_request
def _require_login():
    if not APP_PASSWORD:
        return  # no password configured (e.g. local-LAN-only use) — gate is off
    if request.endpoint in ("login", "static"):
        return
    if not session.get("authenticated"):
        return redirect(url_for("login", next=request.path))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        submitted = request.form.get("password", "")
        if APP_PASSWORD and secrets.compare_digest(submitted, APP_PASSWORD):
            session["authenticated"] = True
            return redirect(request.args.get("next") or url_for("index"))
        error = "Incorrect password."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.pop("authenticated", None)
    return redirect(url_for("login"))


@app.errorhandler(413)
def handle_too_large(e):
    return jsonify({"error": "Those files are too large (800MB max total). Try fewer or smaller files."}), 413


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    files = request.files.getlist("documents")
    files = [f for f in files if f and f.filename]

    if not files:
        return jsonify({"error": "Please upload at least one PDF or Word (.docx) document."}), 400

    try:
        document_text, truncated = extract_document_text(files)
        result = analyze_document(document_text)
    except AnalyzerError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Unexpected error while analyzing the document: {e}"}), 500

    result["_filenames"] = [f.filename for f in files]
    result["_truncated"] = truncated
    # Handed back to the browser so /chat can ask follow-up questions about
    # the same text without the server persisting anything between requests.
    result["_document_text"] = document_text
    return jsonify(result)


@app.route("/chat", methods=["POST"])
def chat():
    payload = request.get_json(silent=True) or {}
    document_text = payload.get("document_text", "")
    question = payload.get("question", "")
    history = payload.get("history", [])

    try:
        answer = chat_about_document(document_text, question, history)
    except AnalyzerError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Unexpected error answering the question: {e}"}), 500

    return jsonify({"answer": answer})


def _lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


if __name__ == "__main__":
    ip = _lan_ip()
    port = 5002
    print("=" * 60)
    print(" Legal Document Analyzer is running")
    print(f"   On this computer:      http://127.0.0.1:{port}")
    print(f"   For coworkers on LAN:  http://{ip}:{port}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False)
