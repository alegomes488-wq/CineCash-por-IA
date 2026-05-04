const https = require('https');
const fs = require('fs');
const path = require('path');

const projectId = 'playearn-b001b';
const bucketName = 'playearn-b001b.appspot.com';
const apkPath = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const destPath = 'apk/cinecash.apk';

async function uploadFile() {
    console.log('📤 Fazendo upload do APK...');
    console.log('📁 Arquivo:', apkPath);
    
    if (!fs.existsSync(apkPath)) {
        console.error('❌ APK não encontrado!');
        return;
    }

    const fileBuffer = fs.readFileSync(apkPath);
    const fileSize = fileBuffer.length;
    console.log('📊 Tamanho:', (fileSize / 1024 / 1024).toFixed(2), 'MB');

    const boundary = 'boundary' + Date.now();
    
    const preamble = `--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Disposition: inline; filename="cinecash.apk"\r\n\r\n`;
    const epilogue = `\r\n--${boundary}--`;
    
    const bodySize = Buffer.byteLength(preamble) + fileSize + Buffer.byteLength(epilogue);
    
    const options = {
        hostname: 'firebasestorage.googleapis.com',
        path: `/upload/v1/b/${bucketName}/o?uploadType=media&name=${encodeURIComponent(destPath)}`,
        method: 'POST',
        headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': bodySize
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.name) {
                    console.log('✅ Upload concluído!');
                    console.log('📍 Path:', json.name);
                    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(destPath)}?alt=media`;
                    console.log('🔗 URL de download:');
                    console.log(downloadUrl);
                } else {
                    console.log('❌ Erro:', JSON.stringify(json, null, 2));
                }
            } catch(e) {
                console.log('Resposta:', data);
            }
        });
    });

    req.on('error', (e) => console.error('❌ Erro:', e.message));

    req.write(preamble);
    req.write(fileBuffer);
    req.write(epilogue);
    req.end();
}

uploadFile();
