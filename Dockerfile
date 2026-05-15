# Dockerfile Mestre para Hugging Face Spaces - CyberCore IA v3.2
FROM python:3.11-slim

# Instala dependências de sistema essenciais
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia e instala as dependências primeiro para aproveitar o cache do Docker
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia as pastas do projeto para dentro do container
COPY backend/ /app/backend/
COPY www/ /app/www/

# Define permissões globais (necessário para o ambiente HF Spaces)
RUN chmod -R 777 /app

# Variável de ambiente para o Python localizar os módulos
ENV PYTHONPATH=/app

# O Hugging Face usa a porta 7860 por padrão, mas aceita a variável $PORT
EXPOSE 7860

# Comando de inicialização otimizado
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860} --proxy-headers --forwarded-allow-ips='*'"]
