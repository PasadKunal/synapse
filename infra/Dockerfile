FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg, numpy, cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cached layer)
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Copy source
COPY . .

EXPOSE 8000
