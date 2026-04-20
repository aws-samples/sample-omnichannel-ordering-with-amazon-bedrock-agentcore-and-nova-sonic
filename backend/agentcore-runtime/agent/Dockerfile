FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.12-slim

WORKDIR /app

RUN pip install --upgrade pip

# Install system dependencies for PyAudio and other packages
RUN apt-get update && apt-get install -y \
    portaudio19-dev \
    gcc \
    g++ \
    make \
    libasound2-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set a fallback version for setuptools-scm (in case git metadata is missing)
ENV SETUPTOOLS_SCM_PRETEND_VERSION=0.1.7

# Copy requirements and install remaining dependencies
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy agent files
COPY qsr_agent.py ./
COPY jwt_auth.py ./

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

# Set environment variables
ENV HOST="0.0.0.0"
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check to verify the agent is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

# Set entrypoint to run the agent with websocket_handler
ENTRYPOINT ["python", "qsr_agent.py"]