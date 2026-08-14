@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo MALUPETS - DETALLE HISTORICO DE CAJA
echo ==========================================
echo.
echo No modifica D1.
echo No modifica POS, Agenda, Ventas, Inventario,
echo Clientes, Mascotas, Login ni Roles.
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
echo LISTO.
echo Entra a Caja y usa el icono del ojo en Historico de cierres.
pause
exit /b 0

:error
echo.
echo ERROR: revisa el mensaje anterior.
pause
exit /b 1
