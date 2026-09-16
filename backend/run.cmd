@echo off
cd /d "%~dp0"
call .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload
