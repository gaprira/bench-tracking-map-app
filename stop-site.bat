@echo off
rem ============================================================
rem  Bench map site - stopper
rem  Stops: Cloudflare Tunnel, site server, PostgreSQL
rem  Data stays safe in PostgreSQL for the next launch.
rem ============================================================
setlocal
set "ROOT=D:\bench-tracking-map-app"
set "PGBIN=%ROOT%\pgsql\bin"
set "PGDATA=%ROOT%\pgsql\data"

echo Stopping Cloudflare tunnel...
taskkill /IM cloudflared.exe /F >nul 2>&1

echo Stopping site server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo Stopping PostgreSQL...
"%PGBIN%\pg_ctl.exe" -D "%PGDATA%" stop -m fast >nul 2>&1

echo.
echo All stopped. Your data is saved and will be there next time.
echo You can also close the two site windows manually.
pause
