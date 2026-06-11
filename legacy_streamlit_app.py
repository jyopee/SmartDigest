"""
Legacy Streamlit app — deprecated.

Use FastAPI backend (backend/main.py) + React frontend (frontend/) instead.
See README.md for run instructions.
"""

raise SystemExit(
    "Streamlit app is deprecated. Run:\n"
    "  cd backend && uvicorn main:app --reload\n"
    "  cd frontend && npm install && npm run dev"
)
