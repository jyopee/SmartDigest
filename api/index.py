"""Vercel serverless entrypoint — re-exports backend/main.py FastAPI app."""
import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from main import app  # noqa: E402

__all__ = ["app"]
