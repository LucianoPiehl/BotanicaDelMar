@echo off
setlocal
set NGROK_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe
if not exist "%NGROK_EXE%" (
  echo No se encontro ngrok en la ruta esperada.
  echo Cerra y abri la terminal, o reinstala con: winget install --id Ngrok.Ngrok -e --source winget
  pause
  exit /b 1
)

set /p NGROK_TOKEN=Pegue su authtoken de ngrok y presione Enter: 
"%NGROK_EXE%" config add-authtoken %NGROK_TOKEN%
echo.
echo Token configurado. Ahora puede ejecutar start_ngrok.cmd
pause
