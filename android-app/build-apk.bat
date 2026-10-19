@echo off
chcp 65001 >nul
rem Сборка подписанного APK «Скамейки» -> dist\benchhunt.apk
cd /d "%~dp0"

if not defined JAVA_HOME (
  for /d %%J in ("C:\Program Files\Microsoft\jdk-21*") do set "JAVA_HOME=%%J"
)
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo Не найден JDK 21. Установи: winget install Microsoft.OpenJDK.21
  pause & exit /b 1
)

if not exist node_modules call npm install || goto :fail
call npx cap sync android || goto :fail

pushd android
call gradlew.bat assembleRelease || (popd & goto :fail)
popd

if not exist dist mkdir dist
copy /y android\app\build\outputs\apk\release\app-release.apk dist\benchhunt.apk >nul
echo.
echo Готово: %~dp0dist\benchhunt.apk
pause
exit /b 0

:fail
echo Сборка не удалась, смотри ошибки выше.
pause
exit /b 1
