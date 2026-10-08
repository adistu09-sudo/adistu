import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent

os.environ["FIREBASE_PROJECT_ID"] = "demo-adistu"
os.environ["GOOGLE_CLOUD_PROJECT"] = "demo-adistu"
os.environ["FIREBASE_API_KEY"] = "demo-api-key"
os.environ["FIREBASE_AUTH_DOMAIN"] = "localhost"
os.environ["FIREBASE_APP_ID"] = "1:000000000000:web:demo-adistu"
os.environ["FIREBASE_MESSAGING_SENDER_ID"] = "000000000000"
os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
os.environ["FIREBASE_AUTH_EMULATOR_URL"] = "http://127.0.0.1:9099"
os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"

sys.path.insert(0, str(PROJECT_ROOT))

from flask import abort, send_from_directory

from backend.app import app


@app.get("/")
def local_index():
    return send_from_directory(PROJECT_ROOT, "index.html")


@app.get("/<path:filename>")
def local_static_file(filename):
    if filename not in {"index.html", "script.js", "style.css", "logo.svg"}:
        abort(404)
    return send_from_directory(PROJECT_ROOT, filename)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
