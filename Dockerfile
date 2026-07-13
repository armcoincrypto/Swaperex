# Multi-stage Dockerfile for Swaperex
# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY pyproject.toml .
RUN mkdir -p src/swaperex && touch src/swaperex/__init__.py
RUN pip install --upgrade pip && \
    pip install . && \
    pip install bip-utils tronpy web3

# Stage 2: Runtime
FROM python:3.11-slim as runtime

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

# Copy application code
COPY src/ src/
COPY scripts/ scripts/

# Create non-root user and data directory for SQLite
RUN useradd -m -s /bin/bash swaperex && \
    mkdir -p /app/data && \
    chown -R swaperex:swaperex /app

USER swaperex

# Health checks are defined per-service in docker-compose.yml (api only).
# Do not add a global HEALTHCHECK here — bot/scanner containers do not listen on :8000.

# Default command (can be overridden)
CMD ["python", "-m", "swaperex.main"]
