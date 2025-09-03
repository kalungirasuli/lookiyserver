# AI-Powered Recommendation System

This document describes the AI-powered recommendation system built for the Lookiy networking platform.

## Overview

The recommendation system uses machine learning to suggest relevant connections to users within their networks based on profile similarity, shared interests, skills, and goals.

## Architecture

### Components

1. **AI Service** (`AI/app.py`)
   - FastAPI-based service that handles ML computations
   - Uses SentenceTransformer for text embeddings
   - Supports both neural network and cosine similarity matching
   - Provides `/recommend` endpoint for user matching

2. **Recommendation Service** (`src/services/recommendationService.ts`)
   - Core business logic for recommendations
   - Handles caching and database operations
   - Integrates with AI service for ML computations
   - Manages recommendation lifecycle

3. **Recommendation Controller** (`src/controllers/recommendationController.ts`)
   - API endpoints for recommendation features
   - Authentication and authorization
   - Analytics and health monitoring

4. **Database Schema**
   - `user_recommendations` table for storing recommendations
   - Indexes for performance optimization
   - Tracking of served and acted-upon recommendations

## Features

### Core Functionality

- **Smart Matching**: Uses AI to analyze user profiles and find compatible connections
- **Network-Scoped**: Recommendations are generated within specific networks
- **Caching**: Intelligent caching to avoid redundant AI computations
- **Real-time Updates**: Integration with Kafka for event-driven updates

### API Endpoints

- `GET /V1/recommendations/networks/:networkId` - Get recommendations for user
- `POST /V1/recommendations/networks/:networkId/refresh` - Force refresh recommendations
- `POST /V1/recommendations/networks/:networkId/acted-upon/:userId` - Mark recommendation as acted upon
- `GET /V1/recommendations/networks/:networkId/analytics` - Get analytics (admin only)
- `GET /V1/recommendations/health` - System health check

### Analytics & Tracking

- Track recommendation serving and user actions
- Conversion rate monitoring
- Match score analytics
- Admin dashboard for network insights

## Setup Instructions

### 1. AI Service Setup

```bash
cd AI/
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

### 2. Environment Variables

Add to your `.env` file:
```
AI_SERVICE_URL=http://localhost:8001
```

### 3. Database Migration

The recommendation tables will be created automatically when you run the server:
```bash
npm run dev
```

### 4. Install Dependencies

```bash
npm install
```

## Usage Examples

### Getting Recommendations

```javascript
// GET /V1/recommendations/networks/network-id
{
  "recommendations": [
    {
      "id": "rec-123",
      "user": {
        "id": "user-456",
        "name": "John Doe",
        "bio": "Software engineer passionate about AI",
        "skills": ["JavaScript", "Python", "Machine Learning"],
        "interests": ["Technology", "Innovation"]
      },
      "match_score": 0.8542,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "network_id": "network-id"
}
```

### Analytics Response

```javascript
// GET /V1/recommendations/networks/network-id/analytics
{
  "total_recommendations": 150,
  "served_recommendations": 120,
  "acted_upon_recommendations": 25,
  "average_match_score": 0.7234,
  "conversion_rate": 20.83,
  "top_matches": [...]
}
```

## How It Works

### 1. Profile Analysis

The system creates comprehensive text representations of user profiles including:
- Name and bio
- Skills and interests
- Experience and goals
- Network context

### 2. AI Processing

The AI service:
1. Converts profiles to embeddings using SentenceTransformer
2. Calculates similarity using either:
   - Neural network model (if available)
   - Cosine similarity (fallback)
3. Returns ranked recommendations with scores

### 3. Caching Strategy

- Recommendations are cached for 24 hours
- Cache invalidation on profile updates
- Intelligent refresh based on network activity

### 4. Background Jobs

- Daily cleanup of old recommendations (7+ days)
- Scheduled at 2:00 AM to minimize impact

## Performance Considerations

- **Batch Processing**: Recommendations are generated in batches
- **Caching**: Reduces AI service calls by 80%+
- **Database Indexes**: Optimized queries for fast retrieval
- **Async Processing**: Non-blocking recommendation generation

## Monitoring & Health

### Health Checks

- AI service availability
- Database connectivity
- System performance metrics

### Logging

- Comprehensive logging for debugging
- Performance metrics tracking
- Error monitoring and alerting

## Future Enhancements

1. **Advanced ML Models**: Integration of more sophisticated recommendation algorithms
2. **Real-time Learning**: Continuous model improvement based on user interactions
3. **Collaborative Filtering**: Recommendations based on similar user behaviors
4. **Content-Based Filtering**: Enhanced profile analysis with NLP
5. **A/B Testing**: Framework for testing different recommendation strategies

## Troubleshooting

### Common Issues

1. **AI Service Unavailable**
   - Check if AI service is running on port 8001
   - Verify `AI_SERVICE_URL` environment variable
   - Check AI service logs for errors

2. **No Recommendations Generated**
   - Ensure users have complete profiles
   - Check network membership status
   - Verify sufficient candidate users in network

3. **Performance Issues**
   - Monitor AI service response times
   - Check database query performance
   - Review caching effectiveness

### Logs Location

- Application logs: Check Winston logger output
- AI service logs: Check uvicorn/FastAPI logs
- Database logs: Check PostgreSQL logs

## Security Considerations

- All endpoints require authentication
- Network membership validation
- Admin-only analytics access
- No sensitive data in recommendations
- Secure AI service communication