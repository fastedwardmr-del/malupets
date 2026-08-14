@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo MALUPETS - DASHBOARD POR ROL + BLOQUEO AGENDA
echo ==========================================
echo.
echo No modifica D1.
echo No modifica Caja, POS, Ventas, Inventario,
echo Clientes, Mascotas, Login ni Usuarios.
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
echo Usa Ctrl+F5 y prueba primero ADMIN y luego SPA.
pause
exit /b 0

:error
echo.
echo ERROR: revisa el mensaje anterior.
pause
exit /b 1
