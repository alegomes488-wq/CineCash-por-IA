# Usa uma imagem Python estável e leve
FROM python:3.11-slim

# Instala dependências de compilação para psutil (Métricas de Hardware)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Copia e instala requisitos primeiro (cache de camada)
# No Hugging Face, o contexto do build geralmente é a raiz do repositório
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Copia o código do backend e as interfaces
COPY backend/ /app/backend/
COPY admin/ /app/admin/
COPY www/ /app/www/

# Ajusta o diretório de trabalho para onde está o main.py
WORKDIR /app/backend

# Permissão total para o Firebase escrever logs se necessário
RUN chmod -R 777 /app

# Porta padrão do Hugging Face Spaces
EXPOSE 7860

# Inicia com Uvicorn para melhor performance e suporte a Async
# Usa a variável de ambiente PORT se disponível (padrão 7860)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
