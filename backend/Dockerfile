FROM python:3.11-slim

# Instala dependências de sistema para Playwright, IA e processamento gráfico
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    wget \
    gnupg \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    librandr2 \
    libgbm1 \
    libpango-1-0-0 \
    libcairo2 \
    libasound2 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Instala Playwright e o navegador Chromium com dependências
RUN pip install --no-cache-dir playwright && \
    playwright install chromium && \
    playwright install-deps chromium

# Copia o restante do código
COPY . .

# Garante permissões para execução e logs
RUN chmod -R 777 /app

# Define variáveis de ambiente para otimização de IA (opcional, dependendo do motor)
ENV PYTHONUNBUFFERED=1

# Expondo a porta para o CyberCore
EXPOSE 8000

# Comando para iniciar o backend com Uvicorn (melhor para produção/concorrência)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
