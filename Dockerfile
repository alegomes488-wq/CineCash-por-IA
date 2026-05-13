# Dockerfile Mestre para Hugging Face Spaces - CyberCore IA v3.2
FROM python:3.11-slim

# Instala dependências de sistema para psutil
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia os requisitos e instala
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia as pastas para a estrutura que o main.py espera
COPY backend/ /app/backend/
COPY admin/ /app/admin/
COPY www/ /app/www/

# Garante permissões
RUN chmod -R 777 /app

# Expõe a porta do Hugging Face
EXPOSE 7860

# Define a variável de ambiente para o Python encontrar os módulos
ENV PYTHONPATH=/app/backend

# Inicia o servidor apontando para o arquivo dentro de backend/
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
