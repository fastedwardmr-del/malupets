@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo MALUPETS - INSTALAR MODULO AGENDA
echo ==========================================
echo.
echo Este proceso agrega SOLO Agenda.
echo No elimina ni modifica ventas, caja,
echo inventario, clientes, mascotas o usuarios.
echo.

cd /d "%~dp0apps\api"

echo [1/3] Aplicando migracion D1 de Agenda...
call npx wrangler d1 execute malupets-db --remote --file=../../database/migrations/05_agenda.sql
if errorlevel 1 goto :error

echo.
echo [2/3] Desplegando API...
call npx wrangler deploy
if errorlevel 1 goto :error

echo.
echo [3/3] Desplegando Frontend...
cd /d "%~dp0apps\web"
call npx wrangler pages deploy . --project-name=malupets
if errorlevel 1 goto :error

echo.
echo ==========================================
echo MODULO AGENDA INSTALADO
echo ==========================================
echo.
echo Entra a:
echo https://malupets.edylaser3d.com/agenda
echo.
pause
exit /b 0

:error
echo.
echo ERROR: el proceso se detuvo.
echo Revisa el mensaje anterior.
pause
exit /b 1
