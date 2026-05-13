import requests
import time

# Tenta Localhost primeiro, se falhar, tenta Hugging Face
BASE_URLS = ["http://localhost:7860", "https://alegomes-desenvolvimento-cybercore-ia.hf.space"]

def run_security_test():
    base_url = None
    for url in BASE_URLS:
        try:
            print(f"Checking {url}...")
            # Tentativa simples de conexão
            resp = requests.get(f"{url}/health", timeout=3)
            if resp.status_code == 200:
                base_url = url
                break
        except: continue

    if not base_url:
        print("❌ ERRO: Nenhum servidor encontrado (Local ou Remoto). Inicie o main.py primeiro!")
        return

    print(f"🛡️ [SENTINEL 2.0 TEST] Usando: {base_url}")
    print(f"👤 Usuário de Teste: {TEST_UID}")

    # 1. Garantir que o usuário receba algum saldo inicial (Simulando atividade)
    print("\n💰 Passo 1: Injetando saldo via Daily Claim...")
    for i in range(3):
        res = requests.post(f"{BASE_URL}/user/claim-daily/{TEST_UID}")
        print(f"   [+] Bônus {i+1} resgatado. Resposta: {res.status_code}")
        time.sleep(1)

    # 2. Simular o Agente Nexus detectando fraude
    # No backend, se balance > 50 (ou inconsistente) e ads < 2, o risco sobe +30 por reporte.
    print("\n🕵️ Passo 2: Enviando telemetria do Agente Nexus (Simulando detecção de bypass)...")
    nexus_payload = {
        "uid": TEST_UID,
        "ads_watched": 0,  # Usuário não viu vídeos
        "balance": 100.0   # Mas afirma ter saldo (Simulação de manipulação de memória/DOM)
    }

    for i in range(4): # Envia 4 vezes para garantir que o risk_score chegue a 100+ (30 * 4 = 120)
        res = requests.post(f"{BASE_URL}/api/nexus/report", json=nexus_payload)
        print(f"   [!] Nexus report {i+1} enviado. Status: {res.status_code}")
        time.sleep(1)

    # 3. Aguardar o Ciclo OADA/Sentinel do Backend
    print("\n⏳ Passo 3: Aguardando 65 segundos para o loop de auditoria do Sentinel processar o banimento...")
    for i in range(65, 0, -5):
        print(f"   Restam {i}s...")
        time.sleep(5)

    # 4. Verificar Status Final do Usuário
    print("\n🔍 Passo 4: Verificando status final no banco de dados...")
    # Usamos o endpoint de métricas ou tentamos um claim para ver se está bloqueado
    res = requests.get(f"{BASE_URL}/user/claim-daily/{TEST_UID}")

    # Se o Sentinel funcionou, o backend deve impedir o claim ou o usuário deve estar com status banido no Firebase
    print(f"📡 Resposta final do servidor: {res.text}")

    if "banido" in res.text.lower() or res.status_code == 403:
        print("\n✅ SUCESSO: O Sentinel 2.0 neutralizou a ameaça e baniu o infrator!")
    else:
        print("\n❌ FALHA: O usuário ainda parece estar ativo. Verifique se o loop de auditoria está rodando.")

if __name__ == "__main__":
    run_security_test()
