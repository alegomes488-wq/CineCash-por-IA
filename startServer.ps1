# Pressione qualquer tecla para parar o servidor
Write-Host '=== CineCash Backend ===' -ForegroundColor Cyan

Push-Location "$PSScriptRoot"
Write-Host 'Servidor CineCash iniciando... (auto-detecção de porta)' -ForegroundColor Green
python backend/main.py
Pop-Location