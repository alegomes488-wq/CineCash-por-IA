# -*- coding: utf-8 -*-
import os
os.environ['PYTHONIOENCODING'] = 'utf-8'

import sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)

import time
import asyncio
import requests
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Depends, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import firebase_admin
from firebase_admin import credentials, db, messaging
from dotenv import load_dotenv

# Carrega variaveis de ambiente (.env)
load_dotenv()

# --- CONFIGURAÇÃO FIREBASE ---
backend_dir = os.path.dirname(__file__)
# Tenta encontrar o arquivo de credenciais (pode ser firebase-adminsdk.json ou serviceAccountKey.json)
cred_filename = "firebase-adminsdk.json"
cred_path = os.path.join(backend_dir, cred_filename)

if not os.path.exists(cred_path):
    # Tenta o nome alternativo se o primeiro não existir
    cred_filename = "serviceAccountKey.json"
    cred_path = os.path.join(backend_dir, cred_filename)

try:
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://playearn-b001b-default-rtdb.firebaseio.com'
            })
        print(f"✅ Firebase Admin iniciado com sucesso usando {cred_filename}")
    else:
        print(f"❌ Erro: Arquivo de credenciais não encontrado em {backend_dir}")
except Exception as e:
    print(f"⚠️ Erro ao iniciar Firebase Admin: {e}")

# Cache para monitorar comportamento (Anti-Bot)
user_behavior_cache = {}

# --- MODULO A & C: SENTINEL 2.0 & NEXUS GROWTH ---
async def cybercore_audit_loop():
    print("🤖 CYBERCORE: Sentinel 2.0 e Nexus Growth em operação...")
    while True:
        try:
            # --- PULSO VITAL (Sincronização com o HUB) ---
            db.reference('status/auditor_last_pulse').set({".sv": "timestamp"})

            users_ref = db.reference('users').get()
            config = db.reference('config').get() or {}

            # --- PROTOCOLOS SENTINEL 2.0 (MODO HARD-BLOCK) ---
            if isinstance(users_ref, dict):
                now = datetime.now()
                inactive_count = 0
                ai_calls_this_loop = 0 # Limitador para não estourar quota

                for uid, user in users_ref.items():
                    if not isinstance(user, dict): continue

                    # 1. Auditoria de Tempo (Sentinel Video Security)
                    last_video_at = user.get('last_video_at')
                    if last_video_at:
                        # Se o usuário assistiu muitos vídeos em tempo impossível
                        vids = user.get('videosWatched', 0)
                        account_age_seconds = (now - datetime.fromtimestamp(user.get('createdAt', time.time()) / 1000 if isinstance(user.get('createdAt'), int) else time.time())).total_seconds()

                        # Média de tempo por vídeo (mínimo real 30s)
                        if vids > 10 and account_age_seconds > 0:
                            avg_time = account_age_seconds / vids
                            if avg_time < 25: # Humanamente impossível manter média de 25s por vídeo
                                if user.get('status') != 'banido':
                                    db.reference(f'users/{uid}/status').set('banido')
                                    db.reference(f'users/{uid}/ban_reason').set(f"Sentinel: Média de tempo suspeita ({avg_time:.1f}s/vid)")
                                    send_telegram_msg(f"🛡️ *SENTINEL: BANIMENTO AUTOMÁTICO*\nUsuário: `{uid}`\nMotivo: Média de tempo impossível ({avg_time:.1f}s)")

                    # 2. Auditoria de Saldo (Integridade SEFAZ)
                    # Verifica se o saldo foi manipulado diretamente no Firebase
                    vids = int(user.get('videosWatched', 0))
                    bonus = float(user.get('referralBonus', 0))
                    balance = float(user.get('balance', 0))

                    # Saldo máximo permitido baseado em vídeos (R$ 0.50 a cada 150)
                    theoretical_max = (vids / 150) * 0.50 + bonus + balance + 5.0 # Margem de R$ 5

                    # Se houver outro campo de saldo que não bate
                    if user.get('total_claimed', 0) > theoretical_max:
                         db.reference(f'users/{uid}/risk_score').set(100)
                         db.reference(f'users/{uid}/status').set('suspeito')

                    # --- NEXUS GROWTH: MONITOR DE RETENÇÃO (OTIMIZADO) ---
                    last_login_str = user.get('lastLogin')
                    if last_login_str:
                        try:
                            last_login_dt = datetime.strptime(last_login_str, "%d/%m/%Y %H:%M:%S")
                            days_inactive = (now - last_login_dt).days

                            if days_inactive >= 3:
                                if user.get('nexus_status') != 'pendente_recuperacao':
                                    db.reference(f'users/{uid}/nexus_status').set('pendente_recuperacao')
                                    inactive_count += 1

                                    # Gera mensagem de retenção personalizada via Gemini (Máx 1 por loop para salvar quota)
                                    balance = float(user.get('balance', 0))
                                    if balance > 0 and config.get('geminiKey') and ai_calls_this_loop < 1:
                                        prompt = f"Crie uma mensagem curta e persuasiva para o usuário {user.get('fullname', 'visionário')} que não entra há {days_inactive} dias e tem R$ {balance:.2f} parados na conta CineCash. Use emojis e tom motivador."
                                        msg = ask_gemini(prompt)
                                        if "❌" not in msg:
                                            db.reference(f'users/{uid}/nexus_message').set(msg)
                                            ai_calls_this_loop += 1

                        except: pass

                if inactive_count > 0:
                    send_telegram_msg(f"📈 *NEXUS GROWTH*\nIdentificados `{inactive_count}` usuários inativos.")

        except Exception as e:
            print(f"⚠️ Erro Auditoria: {e}")
        
        # --- RASTREADOR DE LIQUIDAÇÃO ASAAS ---
        try:
            await track_asaas_transfers()
        except: pass

        await asyncio.sleep(60)

async def track_asaas_transfers():
    """Consulta o status real das transferências no Asaas"""
    config = db.reference('config').get() or {}
    api_key = (config.get('asaasKey') or "").strip()
    if not api_key: return

    is_sandbox = "sandbox" in api_key.lower() or "test" in api_key.lower()
    if "_prod_" in api_key.lower(): is_sandbox = False
    
    base_url = "https://sandbox.asaas.com/api/v3/transfers" if is_sandbox else "https://www.asaas.com/api/v3/transfers"
    headers = {"access_token": api_key}

    # Busca saques que foram 'enviados' mas ainda não 'finalizados'
    withdrawals = db.reference('withdrawals').get() or {}
    for uid, user_wds in withdrawals.items():
        if not isinstance(user_wds, dict): continue
        for wid, data in user_wds.items():
            if data.get('status') == 'paid' and data.get('asaas_id'):
                asaas_id = data.get('asaas_id')
                try:
                    resp = requests.get(f"{base_url}/{asaas_id}", headers=headers, timeout=10)
                    if resp.status_code == 200:
                        status_asaas = resp.json().get('status')
                        # Se já foi concluído no banco
                        if status_asaas in ['DONE', 'CONFIRMED']:
                            db.reference(f'withdrawals/{uid}/{wid}/status').set('finalizado')
                            db.reference(f'withdrawals/{uid}/{wid}/finalized_at').set(datetime.now().isoformat())
                            print(f"💰 [RASTREADOR] Saque {wid} FINALIZADO com sucesso no banco.")
                        elif status_asaas == 'FAILED':
                            db.reference(f'withdrawals/{uid}/{wid}/status').set('falha_bancaria')
                            print(f"❌ [RASTREADOR] Saque {wid} FALHOU no processamento bancário.")
                except: pass

# --- MODULO B: GEMINI CORE ---
def ask_gemini(prompt: str):
    try:
        config = db.reference('config').get() or {}
        api_key = str(config.get('geminiKey', '')).strip()
        if not api_key: return "⚠️ Chave não configurada."

        users_raw = db.reference('users').get()
        if isinstance(users_raw, dict):
            users_list = [u for u in users_raw.values() if isinstance(u, dict)]
        else:
            users_list = []

        total_users = len(users_list)
        ativos = sum(1 for u in users_list if u.get('status') == 'ativo')
        total_saldo = sum(float(u.get('balance', 0)) for u in users_list)

        contexto_sistema = f"""
        DADOS REAIS:
        - Total de Usuários: {total_users}
        - Ativos: {ativos}
        - Saldo Total: R$ {total_saldo:.2f}
        """

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        full_prompt = f"{contexto_sistema}\n\nPergunta: {prompt}"
        payload = {"contents": [{"parts": [{"text": full_prompt}]}]}
        resp = requests.post(url, json=payload, timeout=10)

        if resp.status_code == 200:
            return resp.json()['candidates'][0]['content']['parts'][0]['text']
        return f"❌ Erro IA ({resp.status_code})"
    except Exception as e:
        return f"❌ Falha IA: {str(e)}"

# --- TELEGRAM GATEWAY ---
def send_push_notification(uid: str, title: str, body: str, url: str = "/"):
    """
    Envia uma notificação push via FCM para um usuário específico.
    """
    try:
        user_ref = db.reference(f'users/{uid}').get()
        if not user_ref: return

        fcm_token = user_ref.get('fcm_token')
        if not fcm_token:
            print(f"⚠️ FCM: Usuário {uid} não possui token registrado.")
            return

        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data={
                "url": url
            },
            token=fcm_token,
        )

        response = messaging.send(message)
        print(f"🚀 FCM: Notificação enviada para {uid}. Resposta: {response}")
    except Exception as e:
        print(f"❌ FCM: Erro ao enviar notificação: {e}")

def send_telegram_msg(text: str):
    try:
        config = db.reference('config').get() or {}
        token = config.get('telegramToken')
        chat_id = config.get('telegramChatId')
        if token and chat_id:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            requests.post(url, data={'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'})
    except: pass

# --- AUXILIARES ---
def detect_pix_type(pix_key: str):
    pix_key = str(pix_key).strip().replace(".", "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    
    if "@" in pix_key:
        return "EMAIL"

    # Se começar com + ou tiver formato de celular brasileiro (11 dígitos começando com DDD válido)
    if pix_key.startswith("+") or (len(pix_key) == 11 and pix_key[2] == '9'):
        return "PHONE"
    
    if len(pix_key) == 11:
        # Se não for telefone (9º dígito), assumimos CPF
        return "CPF"
        
    if len(pix_key) == 14:
        return "CNPJ"

    return "EVP" 

# --- PROTOCOLOS SENTINEL (IP BLOCKING) ---
def is_ip_blocked(ip: str):
    if not ip: return False
    if ip in ["127.0.0.1", "localhost", "::1"]: return False
    ip_key = ip.replace(".", "_").replace(":", "_")
    return db.reference(f'blacklist_ips/{ip_key}').get() is not None

def block_ip(ip: str, reason: str):
    ip_key = ip.replace(".", "_").replace(":", "_")
    db.reference(f'blacklist_ips/{ip_key}').set({
        "reason": reason,
        "blocked_at": datetime.now().isoformat(),
        "ip": ip
    })
    send_telegram_msg(f"🛡️ *SENTINEL: IP BLOQUEADO*\nIP: `{ip}`\nMotivo: {reason}")

# --- APP SETUP ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cybercore_audit_loop())
    yield
    task.cancel()

app = FastAPI(title="CineCash Core IA - Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cinecash.app", 
        "https://www.cinecash.app", 
        "https://api.cinecash.app",
        "http://localhost",
        "http://localhost:5500",
        "http://localhost:5501",
        "http://127.0.0.1",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5501",
        "http://127.0.0.1:8000"
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

ASAAS_API_KEY = os.getenv("ASAAS_API_KEY", "")

@app.get("/")
def home():
    return {"status": "online", "service": "CineCash Core IA", "time": datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

@app.api_route("/heartbeat/site", methods=["GET", "POST", "OPTIONS"])
@app.api_route("/heartbeat/site/", methods=["GET", "POST", "OPTIONS"])
async def site_pulse():
    try:
        db.reference('status/site_last_pulse').set({".sv": "timestamp"})
        return {"status": "pulsing", "timestamp": "firebase_server_sync"}
    except Exception as e:
        print(f"❌ [ERRO] Falha no pulso CineCash: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/ai/chat")
async def ai_chat(data: dict = Body(...)):
    prompt = data.get("prompt", "")
    return {"answer": str(ask_gemini(prompt))}

@app.post("/video/start/{uid}")
async def start_video(uid: str, request: Request):
    user_ip = request.headers.get("X-Forwarded-For")
    if not user_ip:
        user_ip = request.client.host if request.client else "127.0.0.1"

    if is_ip_blocked(user_ip):
        raise HTTPException(status_code=403, detail="Acesso bloqueado por protocolos de segurança (IP Sentinel).")

    # NOVA TRAVA JURÍDICA: Verifica se aceitou os termos antes de começar a ganhar
    user_data = db.reference(f'users/{uid}').get()
    if not user_data or not user_data.get('legal_acceptance', {}).get('accepted'):
        raise HTTPException(status_code=403, detail="Aceite os termos de uso para iniciar o processamento.")

    db.reference(f'active_sessions/{uid}').set({
        "startTime": time.time(),
        "status": "watching",
        "ip": user_ip
    })
    return {"status": "success", "message": "Cronômetro iniciado."}

@app.get("/users/all")
async def get_all_users_with_geo():
    try:
        users = db.reference('users').get() or {}
        # Opcionalmente podemos enriquecer com dados de IP se existirem
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/video/complete/{uid}")
async def complete_video(uid: str, request: Request):
    user_ip = request.headers.get("X-Forwarded-For")
    if not user_ip:
        user_ip = request.client.host if request.client else "127.0.0.1"

    if is_ip_blocked(user_ip):
        raise HTTPException(status_code=403, detail="Seu IP foi bloqueado por atividade suspeita.")

    session_ref = db.reference(f'active_sessions/{uid}')
    session = session_ref.get()

    # Salva IP no usuário para detecção de VPN futuro no Painel
    db.reference(f'users/{uid}/last_ip').set(user_ip)

    if not session:
        # Se não houver sessão ativa, pode ser tentativa de hit direto na URL
        db.reference(f'logs/frauds/{uid}').push({
            "type": "direct_url_access",
            "timestamp": time.time(),
            "detail": "Tentativa de completar vídeo sem iniciar sessão"
        })
        raise HTTPException(status_code=400, detail="Sessão não iniciada. Inicie o vídeo primeiro.")

    elapsed = time.time() - session.get("startTime", 0)

    # 2. Bloqueio por tempo mínimo (Sentinel 2.0)
    if elapsed < 28:
        ip_key = user_ip.replace(".", "_").replace(":", "_")
        v_ref = db.reference(f'ip_violations/{ip_key}')
        v_count = (v_ref.get() or 0) + 1
        v_ref.set(v_count)

        if v_count >= 5:
            block_ip(user_ip, "Sentinel: Múltiplas tentativas de bypass de tempo (< 28s)")

        db.reference(f'logs/frauds/{uid}').push({
            "type": "time_bypass",
            "elapsed": round(elapsed, 2),
            "timestamp": time.time(),
            "detail": f"Vídeo completado em apenas {round(elapsed, 2)} segundos"
        })
        current_risk = db.reference(f'users/{uid}/risk_score').get() or 0
        if isinstance(current_risk, str): current_risk = 50
        db.reference(f'users/{uid}/risk_score').set(current_risk + 20)

        if current_risk >= 100:
             db.reference(f'users/{uid}/status').set('banido')

        # Limpa a sessão mesmo em caso de erro
        session_ref.delete()

        raise HTTPException(status_code=403, detail="Processamento recusado: tempo insuficiente para validação neural.")

    # 3. Crédito de saldo e progresso
    user_ref = db.reference(f'users/{uid}')
    user_data = user_ref.get()

    if not user_data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    # TRAVA DE SEGURANÇA EXTRA: Verifica aceite jurídico no momento do crédito
    if not user_data.get('legal_acceptance', {}).get('accepted'):
        raise HTTPException(status_code=403, detail="Processamento negado: Termos não aceitos.")

    old_count = user_data.get("videosWatched", 0)
    new_count = old_count + 1

    # Recompensa unitária: R$ 0.50 / 150 vídeos = R$ 0.003333...
    reward = 0.50 / 150
    current_balance = float(user_data.get("balance", 0))
    new_balance = current_balance + reward

    user_ref.update({
        "videosWatched": new_count,
        "balance": new_balance,
        "last_video_at": time.time()
    })

    # --- LÓGICA DE INDICAÇÃO (MISSÕES) ---
    referred_by = user_data.get("referredBy")
    if referred_by and new_count == 150:
        # Bônus pro NOVO USUÁRIO (indicado)
        new_balance += 0.50  # Bônus de conclusão da primeira missão
        db.reference(f'users/{uid}/balance').set(new_balance)
        
        # Bônus pro PADRINHO (indicando)
        referrer_ref = db.reference(f'users/{referred_by}')
        referrer_data = referrer_ref.get()
        if referrer_data:
            current_bonus = float(referrer_data.get('referralBonus', 0))
            ref_balance = float(referrer_data.get('balance', 0))
            valid_refs = int(referrer_data.get('validReferrals', 0)) + 1
            
            # Padrinho ganha 0.15 base
            reward_ref = 0.15
            
            # Bônus de Missão: A cada 5 validados, ganha + 0.25 (Fechando 1.00)
            if valid_refs % 5 == 0:
                reward_ref += 0.25
                
            referrer_ref.update({
                "referralBonus": current_bonus + reward_ref,
                "balance": ref_balance + reward_ref,
                "validReferrals": valid_refs
            })

            # Registra o evento no nó de indicações
            db.reference(f'referrals/{referred_by}/{uid}').update({
                "status": "completed",
                "last_cycle_at": datetime.now().isoformat()
            })

            send_telegram_msg(f"🎁 *NEXUS GROWTH*\nUsuário `{uid}` ativou conta! Padrinho `{referred_by}` recebeu R$ {reward_ref:.2f}.")

    session_ref.delete()

    print(f"💰 [RECOMPENSA] Usuário {uid} completou vídeo. Total: {new_count} - Saldo: R$ {new_balance:.4f}")
    return {"status": "success", "new_count": new_count, "reward": reward, "balance": new_balance}

@app.post("/user/claim-daily/{uid}")
async def claim_daily_bonus(uid: str):
    """
    Processa o resgate do bônus diário de R$ 0,20 validando a data no servidor.
    """
    user_ref = db.reference(f'users/{uid}')
    user = user_ref.get()

    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    # TRAVA JURÍDICA: Impede bônus sem aceite
    if not user.get('legal_acceptance', {}).get('accepted'):
        raise HTTPException(status_code=403, detail="Aceite os termos para resgatar bônus.")

    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    last_claim = user.get('last_daily_bonus_date')

    if last_claim == today_str:
        raise HTTPException(status_code=400, detail="Bônus diário já resgatado hoje.")

    current_balance = float(user.get('balance', 0))
    bonus_amount = 0.20
    new_balance = current_balance + bonus_amount

    user_ref.update({
        "balance": new_balance,
        "last_daily_bonus_date": today_str,
        "last_daily_bonus_at": time.time() * 1000
    })

    return {
        "status": "success",
        "message": "Bônus diário creditado!",
        "new_balance": new_balance,
        "bonus": bonus_amount
    }

@app.post("/payments/approve/{withdrawal_id}")
async def approve_payment(withdrawal_id: str):
    # Tenta pegar a chave do Firebase primeiro (mais atualizada), se não, usa a do .env
    config = db.reference('config').get() or {}
    api_key = config.get('asaasKey') or ASAAS_API_KEY

    if not api_key:
        raise HTTPException(status_code=500, detail="ASAAS_API_KEY não configurada no .env ou Firebase.")

    # Remove possíveis espaços ou quebras de linha acidentais
    api_key = api_key.strip()

    withdraw_ref = db.reference(f'admin/pending_withdrawals/{withdrawal_id}')
    w_data = withdraw_ref.get()
    if not w_data:
        # Se não estiver no pendente, pode já ter sido processado ou estar no histórico
        raise HTTPException(status_code=404, detail="Saque não encontrado na fila pendente.")

    uid = w_data.get('uid')
    amount = float(w_data.get('amount', 0))
    pix_key = w_data.get('pixKey')

    # Auditoria de Saldo Real
    user = db.reference(f'users/{uid}').get()
    if not user:
         raise HTTPException(status_code=404, detail="Usuário do saque não localizado.")

    # TRAVA MESTRA: Verifica se o usuário aceitou os termos antes de o Admin aprovar o PIX
    if not user.get('legal_acceptance', {}).get('accepted'):
        send_telegram_msg(f"🚨 *AUDITORIA: BLOQUEIO CRÍTICO*\nTentativa de aprovação de saque para `{uid}` sem aceite dos termos jurídicos/fiscais.")
        raise HTTPException(status_code=403, detail="Usuário não possui aceite jurídico registrado. Pagamento bloqueado.")

    vids = int(float(user.get('videosWatched', 0)))
    bonus = float(user.get('referralBonus', 0))
    user_balance = float(user.get('balance', 0))

    # Cálculo de integridade: O saldo não pode ser absurdamente maior que (vídeos * recompensa) + bônus
    # Permitimos uma margem de R$ 10.00 para bônus manuais ou iniciais
    theoretical_max = (vids * (0.50/150)) + bonus + 10.00

    if user_balance > (theoretical_max + 0.05):
        db.reference(f'users/{uid}/risk_score').set(100)
        db.reference(f'users/{uid}/status').set('suspeito')
        send_telegram_msg(f"🚨 *AUDITORIA: BLOQUEIO DE SAQUE*\nUsuário: `{uid}` tentou sacar R$ {amount} mas o saldo real auditado ({user_balance:.2f}) excede o limite teórico ({theoretical_max:.2f}).")
        raise HTTPException(status_code=403, detail="Inconsistência de saldo detectada pela Auditoria CyberCore.")

    # A verificação de saldo insuficiente foi removida aqui pois o débito ocorre no momento do pedido (request_payment).
    # O Auditor CyberCore continua validando a integridade do saldo total acima.

    # --- INTEGRAÇÃO REAL ASAAS ---
    headers = {
        "access_token": api_key,
        "Content-Type": "application/json"
    }

    pix_type = detect_pix_type(pix_key)

    # Limpeza profunda da chave
    api_key = api_key.strip()

    # URL Dinâmica (Sandbox vs Produção) - LOGICA À PROVA DE FALHAS
    # Se a chave contém '_prod_', ela é obrigatoriamente PRODUÇÃO.
    if "_prod_" in api_key.lower():
        is_sandbox = False
        asaas_url = "https://www.asaas.com/api/v3/transfers"
    else:
        is_sandbox = True
        asaas_url = "https://sandbox.asaas.com/api/v3/transfers"
    
    print(f"📡 [ASAAS DIAGNÓSTICO] Ambiente Detectado: {'SANDBOX' if is_sandbox else 'PRODUÇÃO'}")
    print(f"🔑 [ASAAS DIAGNÓSTICO] Prefixo Final: {api_key[:10]}...")
    print(f"🌐 [ASAAS DIAGNÓSTICO] URL Alvo: {asaas_url}")

    payload = {
        "value": amount,
        "pixAddressKey": pix_key,
        "pixAddressKeyType": pix_type,
        "description": f"CineCash - Pagamento de Recompensa #{withdrawal_id}"
    }

    try:
        print(f"🚀 [ASAAS] Enviando transferência: R$ {amount} -> {pix_key} ({pix_type})")
        
        response = requests.post(asaas_url, json=payload, headers=headers, timeout=25)
        res_json = response.json()
        
        # LOG DE AUDITORIA CRÍTICA
        print(f"📦 [ASAAS RESPOSTA COMPLETA]: {res_json}")

        if response.status_code == 200:
            asaas_id = res_json.get('id')
            asaas_status = res_json.get('status')
            
            db.reference(f'withdrawals/{uid}/{withdrawal_id}').update({
                "status": "paid",
                "asaas_status": asaas_status,
                "paid_at": datetime.now().isoformat(),
                "asaas_id": asaas_id
            })
            withdraw_ref.delete()
            print(f"✅ [ASAAS] Ordem aceita! ID: {asaas_id} | Status Atual: {asaas_status}")

            # Notifica o usuário via Push
            send_push_notification(
                uid,
                "💰 Pagamento Enviado!",
                f"Seu resgate de R$ {amount:.2f} foi enviado para sua conta PIX.",
                "/#withdraw"
            )

            return {"status": "success", "msg": f"Pagamento enviado! Status: {asaas_status}", "asaas_id": asaas_id}
        else:
            errors = res_json.get('errors', [])
            error_desc = errors[0].get('description') if errors else "Erro desconhecido"
            print(f"❌ [ASAAS] Erro da API: {res_json}")
            return {"status": "error", "msg": f"Asaas: {error_desc}"}

    except Exception as e:
        print(f"💥 [ASAAS] Falha Crítica: {str(e)}")
        return {"status": "error", "msg": "Falha na conexão com o gateway."}

@app.post("/webhook/asaas")
async def asaas_webhook(payload: dict = Body(...)):
    event = payload.get("event")

    # Evento de transferência concluída no Asaas
    if event in ["TRANSFER_DONE", "TRANSFER_CONFIRMED"]:
        transfer = payload.get("transfer")
        if transfer:
            asaas_id = transfer.get("id")
            mapping = db.reference(f'asaas_transfers/{asaas_id}').get()

            if mapping:
                uid = mapping.get("uid")
                wid = mapping.get("withdrawal_id")
                # Atualiza status para Finalizado no Firebase
                db.reference(f'withdrawals/{uid}/{wid}').update({
                    "status": "finalizado",
                    "finalized_at": datetime.now().isoformat()
                })
                print(f"✅ [WEBHOOK ASAAS] Saque {wid} do usuário {uid} FINALIZADO.")

                # Notifica o usuário que o dinheiro caiu
                send_push_notification(
                    uid,
                    "💸 Dinheiro na Conta!",
                    "Sua transferência PIX foi concluída com sucesso. Aproveite!",
                    "/#withdraw"
                )

    return {"status": "received"}

@app.post("/payments/request/{uid}")
async def request_payment(uid: str, data: dict = Body(...)):
    """
    Registra uma solicitação de saque validando o saldo real via Auditoria.
    Inclui bloqueio por duplicidade de Fingerprint (Multi-contas).
    """
    try:
        amount = float(data.get("amount", 0))
        pix_key = str(data.get("pixKey", "")).strip()
        pix_type = str(data.get("pixType", "EVP"))
        fingerprint = data.get("fingerprint")

        if amount < 0.50:
            raise HTTPException(status_code=400, detail="Valor mínimo de saque é R$ 0,50.")

        user_ref = db.reference(f'users/{uid}')
        user = user_ref.get()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")

        # TRAVA JURÍDICA DE SAQUE: Impede solicitação sem aceite
        if not user.get('legal_acceptance', {}).get('accepted'):
            raise HTTPException(status_code=403, detail="Você deve aceitar os termos e obrigações fiscais antes de solicitar saques.")

        # --- SENTINEL 2.0: BLOQUEIO DE FINGERPRINT DUPLICADO ---
        if fingerprint:
            # Salva o fingerprint atual no perfil se não existir
            if not user.get('security', {}).get('fingerprint'):
                db.reference(f'users/{uid}/security/fingerprint').set(fingerprint)

            # Busca todos os usuários para encontrar duplicatas
            all_users = db.reference('users').get()
            if isinstance(all_users, dict):
                duplicates = []
                for other_uid, other_user in all_users.items():
                    if other_uid == uid: continue
                    other_fp = other_user.get('security', {}).get('fingerprint')
                    if other_fp == fingerprint:
                        duplicates.append(other_uid)

                if duplicates:
                    # Registra tentativa de fraude multi-conta
                    db.reference(f'logs/frauds/{uid}').push({
                        "type": "multi_account_fingerprint",
                        "fingerprint": fingerprint,
                        "duplicates": duplicates,
                        "timestamp": time.time()
                    })

                    # Alerta Sentinel
                    send_telegram_msg(f"🛡️ *SENTINEL: BLOQUEIO MULTI-CONTA*\nUsuário: `{uid}`\nFingerprint: `{fingerprint[:15]}...`\nDuplicatas: {len(duplicates)} contas.")

                    raise HTTPException(
                        status_code=403,
                        detail="Fraude detectada: Este dispositivo já está vinculado a outra conta CineCash. Saques bloqueados pela Auditoria Sentinel."
                    )

        # Auditoria de Saldo Real
        vids = int(user.get('videosWatched', 0))
        bonus = float(user.get('referralBonus', 0))
        balance = float(user.get('balance', 0))

        # O saldo do usuário JÁ inclui os earnings (balance é atualizado pelo backend)
        # Portanto: saldo auditável = balance + bonus
        real_balance = balance + bonus

        if amount > (real_balance + 0.01):
            # Log de tentativa de fraude
            db.reference(f'logs/frauds/{uid}').push({
                "type": "withdrawal_fraud_attempt",
                "amount": amount,
                "real_balance": real_balance,
                "timestamp": time.time()
            })
            raise HTTPException(status_code=403, detail="Saldo insuficiente ou inconsistente.")

        # Deduz do saldo do usuário
        new_balance = max(0, balance - amount)
        user_ref.update({"balance": new_balance})

        # Cria a solicitação no nó global e no histórico do usuário
        wid = f"W{int(time.time())}"
        withdrawal_data = {
            "uid": uid,
            "fullname": user.get('fullname', 'Usuário'),
            "amount": amount,
            "pixKey": pix_key,
            "pixType": pix_type,
            "status": "pending",
            "timestamp": time.time() * 1000
        }

        # Salva no histórico do usuário e na fila de pendentes do Admin
        db.reference(f'withdrawals/{uid}/{wid}').set(withdrawal_data)
        db.reference(f'admin/pending_withdrawals/{wid}').set(withdrawal_data)

        # Pulso sonoro para o Hub Sentinel
        db.reference('status/last_withdrawal_alert').set({".sv": "timestamp"})

        return {"status": "success", "msg": "Saque solicitado com sucesso!", "wid": wid}

    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/audit/financial")
async def get_financial_audit():
    """
    Calcula a saúde financeira real cruzando dados do Firebase
    com métricas de CPM da Monetag.
    """
    try:
        # 1. Busca configurações de lucro no Firebase
        config = db.reference('config/audit').get() or {}
        # Atualizado conforme print do usuário: CPM real de $0.18
        cpm_usd = float(config.get('cpm_usd', 0.18))
        usd_to_brl = 5.25 # Cotação atualizada

        # 2. Busca total de vídeos assistidos por todos os usuários
        users = db.reference('users').get() or {}
        total_vids = sum([int(u.get('videosWatched', 0)) for u in users.values() if isinstance(u, dict)])

        # 3. Cálculo de Receita (Monetag)
        # Receita USD = (Vídeos / 1000) * CPM
        revenue_usd = (total_vids / 1000) * cpm_usd
        revenue_brl = revenue_usd * usd_to_brl

        # 4. Cálculo de Despesa (O que deve ser pago aos usuários)
        # Cada 150 vídeos = R$ 0,50
        expense_brl = (total_vids / 150) * 0.50

        # 5. Lucro Líquido
        profit_brl = revenue_brl - expense_brl

        return {
            "total_watched": total_vids,
            "revenue_brl": round(revenue_brl, 2),
            "expense_brl": round(expense_brl, 2),
            "net_profit_brl": round(profit_brl, 2),
            "roi_status": "LUCRO" if profit_brl > 0 else "DÉFICIT",
            "cpm_applied": cpm_usd
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
