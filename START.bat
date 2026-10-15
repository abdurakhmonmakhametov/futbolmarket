@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js topilmadi. Node.js o'rnating.
 pause
 exit /b 1
)
start "Futbol Market (sayt + Telegram bot)" cmd /k "node index.js"
timeout /t 2 >nul
start "" http://localhost:3000
