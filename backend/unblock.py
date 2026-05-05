import os
import firebase_admin
from firebase_admin import credentials, db

backend_dir = r"c:\Users\Alegomes\Desktop\CineCash-por-IA\backend"
cred_path = os.path.join(backend_dir, "firebase-adminsdk.json")

if os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://playearn-b001b-default-rtdb.firebaseio.com'
        })

    print("Desbloqueando IPs locais no Firebase...")
    db.reference('blacklist_ips/127_0_0_1').delete()
    db.reference('blacklist_ips/localhost').delete()
    
    # Also reset the user's status if they were banned
    uid = 'yVjmEMnlHcPgEb5kozRnJNLmHY63'
    db.reference(f'users/{uid}/status').set('ativo')
    db.reference(f'users/{uid}/risk_score').set(0)
    db.reference(f'ip_violations/127_0_0_1').delete()

    print("Limpeza concluída com sucesso.")
else:
    print("Credenciais não encontradas.")
