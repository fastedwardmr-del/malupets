@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo MALUPETS - MODULO REPORTES
echo ==========================================
echo.
echo No modifica D1.
echo No reemplaza POS, Caja, Agenda, Inventario,
echo Ventas, Clientes, Mascotas ni Login.
echo.

cd /d "%~dp0apps\api"
echo [1/2] Desplegando API...
call npx wrangler deploy
if errorlevel 1 goto :error

cd /d "%~dp0apps\web"
echo.
echo [2/2] Desplegando Frontend...
call npx wrangler pages deploy . --project-name=malupets
if errorlevel 1 goto :error

echo.
echo ==========================================
echo REPORTES DESPLEGADO
echo ==========================================
echo.
echo Entra a:
echo https://malupets.edylaser3d.com/reportes
echo.
pause
exit /b 0

:error
echo.
echo ERROR: revisa el mensaje anterior.
pause
exit /b 1
