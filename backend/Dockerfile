# Usa uma imagem Python estável e leve
FROM python:3.11-slim

# Instala dependências de compilação
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho na raiz para evitar erros de importação
WORKDIR /app

# 1. Copia e instala requisitos (cache eficiente)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Copia a estrutura do projeto mantendo o contexto de módulos
COPY backend/ /app/backend/
COPY admin/ /app/admin/
COPY www/ /app/www/

# Permissões para logs e arquivos temporários
RUN chmod -R 777 /app

# Porta padrão do Hugging Face Spaces
EXPOSE 7860

# Execução como módulo Python para garantir que 'backend' seja reconhecido no PATH
CMD ["sh", "-c", "python3 -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860} --proxy-headers --forwarded-allow-ips='*'"]
