FROM python:3.11-slim

# Instalar las utilidades de impresión, escaneo y los binarios precompilados de Pillow y Greenlet para ARM
RUN apt-get update && apt-get install -y --no-install-recommends \
    sane-utils \
    cups-client \
    python3-pil \
    python3-greenlet \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Usamos --system-site-packages para que la app pueda usar Pillow y Greenlet de Debian sin intentar compilarlos
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]