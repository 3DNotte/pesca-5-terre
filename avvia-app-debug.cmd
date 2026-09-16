@echo off
REM Versione "con finestre visibili", solo per debug: usa avvia-app.vbs per l'uso normale
REM (nessuna finestra, log su file in logs\).
cd /d "%~dp0"
echo Avvio backend (Python)...
start "Backend - Pesca 5 Terre" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload"

echo Avvio frontend (Vite)...
start "Frontend - Pesca 5 Terre" cmd /k "cd /d "%~dp0" && set "PATH=C:\Program Files\nodejs;%PATH%" && npm run dev"

timeout /t 3 /nobreak >nul
echo.
echo Aperti due terminali: Backend (porta 8000) e Frontend (porta 5173).
echo Tra qualche secondo apri il browser su http://localhost:5173
start http://localhost:5173
