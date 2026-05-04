import os
import time
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from firebase_admin import credentials, db
from dotenv import load_dotenv
import requests

# Carrega variáveis de ambiente (.env)
load_dotenv()

app = FastAPI(title="CineCash Core IA - Backend")

# Configuração de CORS (Permitir que seu site e Hub acessem o Python)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Em produção, substitua pelo seu domínio
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialização do Firebase Admin (Segurança nível Servidor)
# Você precisará baixar o arquivo JSON de chaves do Firebase Console em:
# Configurações do Projeto -> Contas de Serviço -> Gerar nova chave privada
try:
    cred = credentials.Certificate("firebase-adminsdk.json")
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://playearn-b001b-default-rtdb.firebaseio.com'
    })
except Exception as e:
    print(f"Aviso: Firebase Admin não iniciado. Configure o firebase-adminsdk.json. Erro: {e}")

# --- CONFIGURAÇÕES ---
ASAAS_API_KEY = os.getenv("ASAAS_API_KEY", "")

# --- ROTAS DE SEGURANÇA (ANTI-FRAUDE) ---

@app.post("/video/start/{uid}")
async def start_video(uid: str):
    """
    Registra o momento exato que o usuário começou a ver o anúncio.
    Substitui a contagem no lado do cliente (JavaScript).
    """
    try:
        db.reference(f'active_sessions/{uid}').set({
            "startTime": time.time(),
            "status": "watching",
            "ip": "detect_ip_here" # Opcional: Para bloquear múltiplos acessos por IP
        })
        return {"status": "success", "message": "Cronômetro de segurança iniciado."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/video/complete/{uid}")
async def complete_video(uid: str):
    """
    Valida se o vídeo foi assistido pelo tempo correto antes de dar a recompensa.
    """
    session_ref = db.reference(f'active_sessions/{uid}')
    session = session_ref.get()

    if not session:
        raise HTTPException(status_code=400, detail="Sessão não encontrada ou já processada.")

    elapsed = time.time() - session.get("startTime", 0)

    # BLINDAGEM: Se o tempo for menor que 28 segundos, é tentativa de fraude.
    if elapsed < 28:
        # Registra tentativa de fraude para análise da IA no Hub
        db.reference(f'logs/frauds/{uid}').push({
            "type": "time_bypass",
            "elapsed": elapsed,
            "timestamp": time.time()
        })
        db.reference(f'users/{uid}/risk_score').set("SUSPEITO")
        raise HTTPException(status_code=403, detail="Tempo insuficiente. Assista o vídeo completo.")

    # Se for válido, o PYTHON atualiza o saldo (O JS não tem mais esse poder)
    user_ref = db.reference(f'users/{uid}')
    user_data = user_ref.get()

    new_count = (user_data.get("videosWatched", 0)) + 1
    user_ref.update({"videosWatched": new_count})

    # Limpa a sessão
    session_ref.delete()

    return {"status": "success", "new_count": new_count}

# --- ROTAS FINANCEIRAS (PAGAMENTOS SEGUROS) ---

@app.post("/admin/pay")
async def pay_user(uid: str, amount: float, pix_key: str, pix_type: str = "CPF"):
    """
    Processa o pagamento via Asaas sem expor a chave de API no navegador.
    """
    if not ASAAS_API_KEY:
        raise HTTPException(status_code=500, detail="Chave Asaas não configurada no servidor.")

    payload = {
        "value": amount,
        "pixAddressKey": pix_key,
        "pixAddressKeyType": pix_type,
        "description": "Resgate CineCash"
    }

    headers = {
        "access_token": ASAAS_API_KEY,
        "Content-Type": "application/json"
    }

    # Chamada segura para o Asaas (Python -> Asaas)
    response = requests.post("https://www.asaas.com/api/v3/transfers", json=payload, headers=headers)

    if response.status_code == 200:
        # Atualiza o status no Firebase
        db.reference(f'withdrawals/{uid}').update({"status": "paid"})
        return response.json()
    else:
        return {"error": "Falha no processamento", "details": response.json()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
