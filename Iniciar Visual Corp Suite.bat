@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo No se encontro npm. Instala Node.js LTS y vuelve a intentarlo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias locales por primera vez...
  call npm ci
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

start "" "http://127.0.0.1:5173/"
call npm run dev -- --host 127.0.0.1
pause
