@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js topilmadi. Node.js o'rnating.
 pause
 exit /b 1
)
rem Sayt + Telegram bot + Mini App (https tunnel orqali). Oynani yopsangiz bot to'xtaydi.
start "Futbol Market (sayt + Telegram bot + Mini App)" cmd /k "node telegram-local.js"
timeout /t 3 >nul
start "" http://localhost:3000/admin.html
