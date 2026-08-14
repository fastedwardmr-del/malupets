@echo off
cd /d "%~dp0apps\api"
echo.
echo Aplicando migracion de usuarios y roles en D1 remoto...
call npx wrangler d1 execute malupets-db --remote --file=../../database/migrations/03_auth_roles.sql
if errorlevel 1 goto :error

echo.
echo Desplegando API...
call npx wrangler deploy
if errorlevel 1 goto :error

echo.
echo Desplegando frontend...
cd /d "%~dp0apps\web"
call npx wrangler pages deploy . --project-name=malupets
if errorlevel 1 goto :error

echo.
echo LISTO. Login inicial:
echo admin@malupets.com
echo Malupets2026!
echo.
pause
exit /b 0

:error
echo.
echo Ocurrio un error. Revisa el mensaje anterior.
pause
exit /b 1
