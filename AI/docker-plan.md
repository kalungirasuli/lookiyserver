# Docker Plan for AI Service

## Current Setup Analysis

1. **Main Application**: Node.js application running on port 3000
2. **AI Service**: Python FastAPI application for job matching
3. **Current Dockerfile**: Builds the Node.js application
4. **Current docker-compose.yml**: Sets up multiple services including the main app, postgres, redis, kafka, zookeeper

## AI Service Requirements

- Python 3.9+
- Dependencies from requirements.txt:
  - fastapi
  - uvicorn
  - torch
  - sentence-transformers
  - numpy
  - joblib
  - pydantic
  - scikit-learn
- Model files in jobmatch_model/ directory
- Exposes API on port 8000 (default for uvicorn)

## Proposed Solution

### 1. Create AI/Dockerfile

```dockerfile
# Use Python base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2. Update Main Dockerfile

We need to modify the main Dockerfile to handle both services. However, since they are different technologies (Node.js and Python), it's better to keep them separate and orchestrate with docker-compose.

### 3. Update docker-compose.yml

Add the AI service to the docker-compose file:

```yaml
  ai-service:
    build: 
      context: ./AI
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - PYTHONPATH=/app
    networks:
      - lookiy_network
```

## Implementation Steps

1. Create AI/Dockerfile with the content above
2. Update docker-compose.yml to include the ai-service
3. Test the setup to ensure both services work together