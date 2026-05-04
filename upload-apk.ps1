$ErrorActionPreference = "SilentlyContinue"

Write-Host "📤 Upload do APK para Firebase Storage..."

$apkPath = "C:\Users\Alegomes\cinecash\android\app\build\outputs\apk\debug\app-debug.apk"
$bucketName = "playearn-b001b.appspot.com"
$destPath = "apk/cinecash.apk"

if (!(Test-Path $apkPath)) {
    Write-Host "❌ APK não encontrado em: $apkPath"
    exit 1
}

$fileSize = (Get-Item $apkPath).Length
Write-Host "📊 Tamanho do APK: $([math]::Round($fileSize/1MB, 2)) MB"
Write-Host "📍 Destino: gs://$bucketName/$destPath"

Write-Host ""
Write-Host "⚠️  Para fazer o upload manualmente:"
Write-Host "1. Acesse: https://console.firebase.google.com/project/playearn-b001b/storage"
Write-Host "2. Clique em 'Upload file'"
Write-Host "3. Selecione o APK acima"
Write-Host "4. Nome do arquivo: cinecash.apk"
Write-Host "5. Pasta destino: apk"
Write-Host ""
Write-Host "📝 URL do download após upload:"
Write-Host "https://firebasestorage.googleapis.com/v0/b/$bucketName/o/apk%2Fcinecash.apk?alt=media"

# Try to get Firebase token
try {
    $env:FIREBASE_TOKEN = $null
    
    # Check if firebase is logged in
    $firebaseConfig = Get-Content "$env:USERPROFILE\.config\firebase\playearn-b001b\refresh_tokens.json" -ErrorAction SilentlyContinue
    
    if ($firebaseConfig) {
        Write-Host ""
        Write-Host "✅ Firebase CLI está logado"
    } else {
        Write-Host ""
        Write-Host "⚠️  Firebase CLI não está logado. Faça manualmente pelo console."
    }
} catch {
    Write-Host ""
    Write-Host "⚠️  Firebase CLI não está logado. Faça manualmente pelo console."
}

Write-Host ""
Write-Host "✅ Script concluído!"
