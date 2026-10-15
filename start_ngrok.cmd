@echo off
setlocal
set NGROK_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe
if not exist "%NGROK_EXE%" (
  echo No se encontro ngrok en la ruta esperada.
  echo Instale ngrok con: winget install --id Ngrok.Ngrok -e --source winget
  pause
  exit /b 1
)

echo Abriendo tunel HTTPS hacia http://127.0.0.1:4173
echo Deje esta ventana abierta mientras prueba webhooks.
echo.
"%NGROK_EXE%" http 4173
