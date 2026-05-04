import requests
import time
import random

BASE_URL = "http://localhost:8000"
TEST_UID = "user_test_sentinel_bot"

def simulate_bot():
    print(f"🤖 [STRESS TEST] Iniciando simulação de BOT para o usuário: {TEST_UID}")

    # 1. Inicia o vídeo
    print("🎬 Iniciando vídeo...")
    requests.post(f"{BASE_URL}/video/start/{TEST_UID}")

    # 2. Tenta completar IMEDIATAMENTE (Fraude de tempo)
    print("⏩ Tentando completar vídeo instantaneamente (bypass de 28s)...")
    res = requests.post(f"{BASE_URL}/video/complete/{TEST_UID}")
    print(f"📡 Resposta do Sentinel: {res.status_code} - {res.text}")

    # 3. Simulação de Alta Velocidade (Burlar o loop de 60s do Sentinel)
    print("\n⚡ Iniciando rajada de visualizações (Velocidade > 15 v/min)...")
    for i in range(20):
        requests.post(f"{BASE_URL}/video/start/{TEST_UID}")
        # Pequeno delay para não travar o socket, mas rápido o suficiente para o Sentinel banir
        time.sleep(0.5)
        requests.post(f"{BASE_URL}/video/complete/{TEST_UID}")
        print(f"🚀 Golpe {i+1}/20 enviado.")

    print("\n✅ Rajada finalizada. Aguarde 60s para o Sentinel processar o Auto-Ban.")

if __name__ == "__main__":
    simulate_bot()
