@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo MALUPETS - DESPLIEGUE SEGURO
echo ==========================================
echo.
echo Este script NO modifica D1 ni borra datos.
echo Solo publica API y Frontend.
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
echo DESPLIEGUE COMPLETADO
echo ==========================================
echo Abre:
echo https://malupets.edylaser3d.com/login
echo.
echo Usa Ctrl+F5 si Chrome conserva archivos antiguos.
pause
exit /b 0

:error
echo.
echo ERROR: el despliegue se detuvo. No se modifico D1.
pause
exit /b 1
