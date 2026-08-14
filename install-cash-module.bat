@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo MALUPETS - INSTALAR MODULO CAJA
echo ==========================================
echo.
echo Este instalador agrega SOLO las tablas de Caja
echo y despliega API + Frontend.
echo No elimina ni modifica productos, ventas,
echo clientes, mascotas, usuarios o sesiones.
echo.

cd /d "%~dp0apps\api"

echo [1/3] Aplicando migracion D1 de Caja...
call npx wrangler d1 execute malupets-db --remote --file=../../database/migrations/04_cash.sql
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
echo MODULO CAJA INSTALADO
echo ==========================================
echo.
echo Entra a:
echo https://malupets.edylaser3d.com/caja
echo.
pause
exit /b 0

:error
echo.
echo ERROR: el proceso se detuvo.
echo Revisa el mensaje anterior.
pause
exit /b 1
