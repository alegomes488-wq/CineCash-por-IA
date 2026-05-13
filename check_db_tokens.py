import firebase_admin
from firebase_admin import credentials, db
import os
import json

backend_dir = os.path.join(os.getcwd(), "backend")
cred_path = os.path.join(backend_dir, "firebase-adminsdk.json")

if os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {'databaseURL': 'https://playearn-b001b-default-rtdb.firebaseio.com'})

    users_ref = db.reference('users')
    # Pegar apenas alguns usuários para verificar a estrutura
    users = users_ref.order_by_key().limit_to_last(5).get()

    if users:
        print("--- Últimos 5 usuários registrados/atualizados ---")
        for uid, data in users.items():
            fcm_token = data.get('fcm_token')
            fcmToken = data.get('fcmToken')
            print(f"UID: {uid}")
            print(f"  - fcm_token (frontend): {'OK' if fcm_token else 'Ausente'}")
            print(f"  - fcmToken (backend): {'OK' if fcmToken else 'Ausente'}")
    else:
        print("Nenhum usuário encontrado.")
else:
    print(f"Erro: Credenciais não encontradas em {cred_path}")
