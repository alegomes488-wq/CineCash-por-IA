import firebase_admin
from firebase_admin import credentials, db
import time
from datetime import datetime
import os

# Configuração Firebase
backend_dir = os.path.dirname(__file__)
cred_path = os.path.join(backend_dir, "firebase-adminsdk.json")

if not os.path.exists(cred_path):
    cred_path = os.path.join(backend_dir, "serviceAccountKey.json")

cred = credentials.Certificate(cred_path)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://playearn-b001b-default-rtdb.firebaseio.com'
    })

def test_flow():
    sponsor_uid = "SPONSOR_TEST_001"
    referred_uid = "REFERRED_TEST_001"

    print(f"🚀 Iniciando teste de indicação...")

    # 1. Criar Padrinho
    db.reference(f'users/{sponsor_uid}').set({
        "fullname": "Padrinho de Teste",
        "firstname": "Padrinho",
        "balance": 0.0,
        "referralBonus": 0.0,
        "validReferrals": 0,
        "status": "ativo"
    })
    print(f"✅ Padrinho criado: {sponsor_uid}")

    # 2. Criar Indicado com link do Padrinho
    db.reference(f'users/{referred_uid}').set({
        "fullname": "Indicado de Teste",
        "firstname": "Indicado",
        "referredBy": sponsor_uid,
        "videosWatched": 0,
        "balance": 0.0,
        "status": "ativo",
        "legal_acceptance": {"accepted": True}
    })
    print(f"✅ Indicado criado: {referred_uid} (Indicado por {sponsor_uid})")

    # 3. Simular 15 vídeos (pulando a trava de 28s via DB direto para testar lógica do backend)
    # Na verdade, para testar o backend/main.py eu precisaria rodar o servidor.
    # Mas posso simular o que o backend faria ou rodar o script chamando a função se eu importar.

    from main import complete_video
    import asyncio
    from unittest.mock import MagicMock

    async def simulate_completion():
        print(f"🎬 Simulando 15 vídeos para o indicado...")
        mock_request = MagicMock()
        mock_request.headers = {"X-Forwarded-For": "127.0.0.1"}

        # Vamos setar a sessão inicial para cada vídeo
        for i in range(1, 16):
            db.reference(f'active_sessions/{referred_uid}').set({
                "startTime": time.time() - 30, # Garante que passou os 28s
                "status": "watching"
            })
            await complete_video(referred_uid, mock_request)
            print(f"📹 Vídeo {i}/15 processado.")

    asyncio.run(simulate_completion())

    # 4. Verificar Resultados
    sponsor_data = db.reference(f'users/{sponsor_uid}').get()
    referred_data = db.reference(f'users/{referred_uid}').get()

    print("\n--- RESULTADOS ---")
    print(f"Saldo Padrinho: R$ {sponsor_data.get('balance'):.2f} (Esperado: 0.50)")
    print(f"Bônus Indicação Padrinho: R$ {sponsor_data.get('referralBonus'):.2f} (Esperado: 0.50)")
    print(f"Indicações Válidas Padrinho: {sponsor_data.get('validReferrals')} (Esperado: 1)")

    # O indicado ganha o saldo dos 15 vídeos + 0.50 de bônus de ativação
    # 15 * (0.50/150) = 15 * 0.00333... = 0.05
    # Total esperado indicado: 0.05 + 0.50 = 0.55
    print(f"Saldo Indicado: R$ {referred_data.get('balance'):.2f} (Esperado: 0.55)")

    if sponsor_data.get('balance') == 0.50 and referred_data.get('balance') >= 0.55:
        print("\n✅ TESTE BEM SUCEDIDO: Fluxo de indicação e bônus validado!")
    else:
        print("\n❌ TESTE FALHOU: Valores inconsistentes.")

if __name__ == "__main__":
    test_flow()
