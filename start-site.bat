@echo off
rem ============================================================
rem  Bench map site - launcher
rem  Starts: PostgreSQL -> site server -> Cloudflare Tunnel
rem  Public link appears in the TUNNEL window.
rem ============================================================
setlocal
set "ROOT=D:\bench-tracking-map-app"
set "PGBIN=%ROOT%\pgsql\bin"
set "PGDATA=%ROOT%\pgsql\data"

if not exist "%PGBIN%\pg_ctl.exe" (
  echo PostgreSQL not found at %PGBIN%
  echo Ask the assistant to reinstall PostgreSQL.
  pause
  exit /b 1
)

echo === Bench site launcher ===
echo.

echo [1/4] Starting PostgreSQL...
"%PGBIN%\pg_isready.exe" -h 127.0.0.1 -p 5432 -q >nul 2>&1
if errorlevel 1 (
  "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%ROOT%\pgsql\server.log" start
  if errorlevel 1 (
    echo PostgreSQL failed to start. See pgsql\server.log
    pause
    exit /b 1
  )
)
"%PGBIN%\pg_isready.exe" -h 127.0.0.1 -p 5432 -q
echo       database is up.

echo [2/4] Starting site server...
netstat -aon | findstr ":3000 " | findstr LISTENING >nul
if errorlevel 1 (
  if not exist "%ROOT%\.next\BUILD_ID" (
    echo       first run - building production version, please wait...
    pushd "%ROOT%"
    call npm run build
    popd
  )
  start "Bench site - SERVER" cmd /k "cd /d %ROOT% && npm start"
) else (
  echo       already running.
)

echo       waiting for http://localhost:3000 ...
:waithttp
powershell -NoProfile -Command "try{Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto waithttp
)
echo       site is up.

echo [3/4] Starting Cloudflare Tunnel...
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | find /I "cloudflared.exe" >nul
if errorlevel 1 (
  start "Bench site - TUNNEL: your public LINK here" cmd /k ""%ROOT%\tools\cloudflared.exe" tunnel --url http://localhost:3000"
) else (
  echo       already running.
)

echo.
echo ==========================================================
echo   DONE! The site is running.
echo.
echo   YOUR PUBLIC LINK: open the window called
echo   "Bench site - TUNNEL: your public LINK here"
echo   and copy the line  https://xxxxx.trycloudflare.com
echo   Send that link to your friend!
echo.
echo   Keep both windows open while the site is in use.
echo   To stop everything, run stop-site.bat
echo ==========================================================
echo.
pause
