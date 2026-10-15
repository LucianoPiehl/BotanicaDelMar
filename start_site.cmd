@echo off
cd /d "%~dp0"
setlocal
set NGROK_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe

echo Levantando Botanica del Mar en http://127.0.0.1:4173
echo Tienda publica: /   Panel interno: /admin.html
echo.

if exist "%NGROK_EXE%" (
  echo Iniciando tunel ngrok para webhooks...
  taskkill /IM ngrok.exe /F >nul 2>nul
  start "Botanica del Mar ngrok" /min "%NGROK_EXE%" http 4173
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Start-Sleep -Seconds 4; $t=(Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels').tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1; if (-not $t) { throw 'ngrok no devolvio URL HTTPS' }; $envPath=Join-Path (Get-Location) '.env'; $content=Get-Content -LiteralPath $envPath -Raw; $content=[regex]::Replace($content,'^PUBLIC_BASE_URL=.*$','PUBLIC_BASE_URL=' + $t.public_url,'Multiline'); Set-Content -LiteralPath $envPath -Value $content -Encoding UTF8; Write-Host ('URL publica ngrok: ' + $t.public_url); Write-Host ('Webhook Mercado Pago: ' + $t.public_url + '/api/payments/mercadopago/webhook')"
  if errorlevel 1 (
    echo No se pudo iniciar ngrok automaticamente. El sistema local se levantara igual.
    echo Revise configure_ngrok_token.cmd o start_ngrok.cmd.
  )
) else (
  echo Ngrok no esta instalado. El sistema local se levantara sin webhooks publicos.
)

echo.
node server/server.js
pause

