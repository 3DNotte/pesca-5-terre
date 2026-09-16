@echo off
REM Ferma backend (porta 8000) e frontend (porta 5173) avviati con avvia-app.vbs,
REM che gira senza finestre quindi non c'e' una X da chiudere.
echo Arresto in corso...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%p >nul 2>&1
)

echo Fatto. Backend e frontend fermati.
pause
