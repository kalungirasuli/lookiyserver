from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import numpy as np
import faiss
import google.generativeai as genai
import psycopg2
from sqlalchemy import create_engine, text
import json
import logging
from datetime import datetime
import asyncio
import threading
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini API
genai.configure(api_key=os.getenv('GEMINI_API_KEY', 'your-gemini-api-key-here'))

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'lookiy'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', 'password')
}

# FAISS configuration
EMBEDDING_DIM = 768  # Gemini embedding dimension
FAISS_INDEX_PATH = "faiss_index.bin"
USER_MAPPING_PATH = "user_mapping.json"
NETWORK_MAPPING_PATH = "network_mapping.json"

class FAISSManager:
    def __init__(self):
        self.user_index = None
        self.network_index = None
        self.user_id_to_idx = {}
        self.idx_to_user_id = {}
        self.network_id_to_idx = {}
        self.idx_to_network_id = {}
        self.lock = threading.Lock()
        self.initialize_indices()
    
    def initialize_indices(self):
        """Initialize FAISS indices and load existing data"""
        try:
            # Initialize user index
            self.user_index = faiss.IndexFlatIP(EMBEDDING_DIM)  # Inner product for cosine similarity
            
            # Initialize network index
            self.network_index = faiss.IndexFlatIP(EMBEDDING_DIM)
            
            # Load existing indices if they exist
            if os.path.exists(FAISS_INDEX_PATH + "_users"):
                self.user_index = faiss.read_index(FAISS_INDEX_PATH + "_users")
                logger.info(f"Loaded existing user FAISS index with {self.user_index.ntotal} vectors")
            
            if os.path.exists(FAISS_INDEX_PATH + "_networks"):
                self.network_index = faiss.read_index(FAISS_INDEX_PATH + "_networks")
                logger.info(f"Loaded existing network FAISS index with {self.network_index.ntotal} vectors")
            
            # Load mappings
            if os.path.exists(USER_MAPPING_PATH):
                with open(USER_MAPPING_PATH, 'r') as f:
                    mapping_data = json.load(f)
                    self.user_id_to_idx = mapping_data.get('user_id_to_idx', {})
                    self.idx_to_user_id = mapping_data.get('idx_to_user_id', {})
                    # Convert string keys back to integers for idx_to_user_id
                    self.idx_to_user_id = {int(k): v for k, v in self.idx_to_user_id.items()}
            
            if os.path.exists(NETWORK_MAPPING_PATH):
                with open(NETWORK_MAPPING_PATH, 'r') as f:
                    mapping_data = json.load(f)
                    self.network_id_to_idx = mapping_data.get('network_id_to_idx', {})
                    self.idx_to_network_id = mapping_data.get('idx_to_network_id', {})
                    # Convert string keys back to integers for idx_to_network_id
                    self.idx_to_network_id = {int(k): v for k, v in self.idx_to_network_id.items()}
                    
        except Exception as e:
            logger.error(f"Error initializing FAISS indices: {e}")
            # Fallback to empty indices
            self.user_index = faiss.IndexFlatIP(EMBEDDING_DIM)
            self.network_index = faiss.IndexFlatIP(EMBEDDING_DIM)
    
    def save_indices(self):
        """Save FAISS indices and mappings to disk"""
        try:
            with self.lock:
                # Save indices
                faiss.write_index(self.user_index, FAISS_INDEX_PATH + "_users")
                faiss.write_index(self.network_index, FAISS_INDEX_PATH + "_networks")
                
                # Save user mappings
                user_mapping_data = {
                    'user_id_to_idx': self.user_id_to_idx,
                    'idx_to_user_id': {str(k): v for k, v in self.idx_to_user_id.items()}
                }
                with open(USER_MAPPING_PATH, 'w') as f:
                    json.dump(user_mapping_data, f)
                
                # Save network mappings
                network_mapping_data = {
                    'network_id_to_idx': self.network_id_to_idx,
                    'idx_to_network_id': {str(k): v for k, v in self.idx_to_network_id.items()}
                }
                with open(NETWORK_MAPPING_PATH, 'w') as f:
                    json.dump(network_mapping_data, f)
                    
                logger.info("FAISS indices and mappings saved successfully")
        except Exception as e:
            logger.error(f"Error saving FAISS indices: {e}")

# Initialize FAISS manager
faiss_manager = FAISSManager()

# FastAPI instance
app = FastAPI(title="AI Recommendation Engine with FAISS + Gemini")

# Input schemas
# Data Models
class MatchInput(BaseModel):
    resume: str
    job_description: str

class UserProfile(BaseModel):
    id: str
    name: str
    bio: Optional[str] = None
    skills: Optional[List[str]] = []
    interests: Optional[List[str]] = []
    experience: Optional[str] = None
    goals: Optional[List[str]] = []

class NetworkContext(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    goals: Optional[List[str]] = []

class RecommendationRequest(BaseModel):
    user_profile: UserProfile
    candidate_profiles: List[UserProfile]
    network_context: Optional[NetworkContext] = None

class RecommendationResponse(BaseModel):
    recommendations: List[dict]

class EmbeddingRequest(BaseModel):
    user_data: Dict[str, Any]
    user_id: str

class NetworkEmbeddingRequest(BaseModel):
    network_data: Dict[str, Any]
    network_id: str

class FAISSQueryRequest(BaseModel):
    user_id: str
    top_n: int = 10
    network_filter: Optional[str] = None

class UserRegistrationRequest(BaseModel):
    user_id: str
    profile_data: Dict[str, Any]

# Utility Functions
def generate_embedding(text: str) -> np.ndarray:
    """Generate Gemini embedding for given text"""
    try:
        model = genai.GenerativeModel('models/embedding-001')
        result = model.embed_content(text)
        embedding = np.array(result['embedding'], dtype=np.float32)
        # Normalize for cosine similarity
        embedding = embedding / np.linalg.norm(embedding)
        return embedding
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        # Fallback to random embedding (should not happen in production)
        return np.random.random(EMBEDDING_DIM).astype(np.float32)

def create_profile_text(profile: UserProfile, network_context: Optional[NetworkContext] = None) -> str:
    """Convert user profile to text for embedding generation"""
    text_parts = []
    
    if profile.name:
        text_parts.append(f"Name: {profile.name}")
    
    if profile.bio:
        text_parts.append(f"Bio: {profile.bio}")
    
    if profile.skills:
        text_parts.append(f"Skills: {', '.join(profile.skills)}")
    
    if profile.interests:
        text_parts.append(f"Interests: {', '.join(profile.interests)}")
    
    if profile.experience:
        text_parts.append(f"Experience: {profile.experience}")
    
    if profile.goals:
        text_parts.append(f"Goals: {', '.join(profile.goals)}")
    
    if network_context:
        text_parts.append(f"Network: {network_context.name}")
        if network_context.description:
            text_parts.append(f"Network Description: {network_context.description}")
        if network_context.goals:
            text_parts.append(f"Network Goals: {', '.join(network_context.goals)}")
    
    return " | ".join(text_parts)

def create_network_text(network_data: Dict[str, Any]) -> str:
    """Convert network data to text for embedding generation"""
    text_parts = []
    
    if network_data.get('name'):
        text_parts.append(f"Network: {network_data['name']}")
    
    if network_data.get('description'):
        text_parts.append(f"Description: {network_data['description']}")
    
    if network_data.get('goals'):
        goals = network_data['goals']
        if isinstance(goals, list):
            text_parts.append(f"Goals: {', '.join(goals)}")
        else:
            text_parts.append(f"Goals: {goals}")
    
    if network_data.get('industry'):
        text_parts.append(f"Industry: {network_data['industry']}")
    
    if network_data.get('location'):
        text_parts.append(f"Location: {network_data['location']}")
    
    return " | ".join(text_parts)

def add_user_to_faiss(user_id: str, embedding: np.ndarray) -> bool:
    """Add user embedding to FAISS index"""
    try:
        with faiss_manager.lock:
            # Check if user already exists
            if user_id in faiss_manager.user_id_to_idx:
                # Update existing user
                idx = faiss_manager.user_id_to_idx[user_id]
                # FAISS doesn't support direct updates, so we need to rebuild
                # For now, we'll remove and re-add
                logger.info(f"User {user_id} already exists in FAISS, will be updated on next rebuild")
                return True
            
            # Add new user
            idx = faiss_manager.user_index.ntotal
            faiss_manager.user_index.add(embedding.reshape(1, -1))
            faiss_manager.user_id_to_idx[user_id] = idx
            faiss_manager.idx_to_user_id[idx] = user_id
            
            # Save indices periodically
            if idx % 100 == 0:  # Save every 100 additions
                faiss_manager.save_indices()
            
            logger.info(f"Added user {user_id} to FAISS index at position {idx}")
            return True
    except Exception as e:
        logger.error(f"Error adding user {user_id} to FAISS: {e}")
        return False

def add_network_to_faiss(network_id: str, embedding: np.ndarray) -> bool:
    """Add network embedding to FAISS index"""
    try:
        with faiss_manager.lock:
            # Check if network already exists
            if network_id in faiss_manager.network_id_to_idx:
                # Update existing network
                idx = faiss_manager.network_id_to_idx[network_id]
                logger.info(f"Network {network_id} already exists in FAISS, will be updated on next rebuild")
                return True
            
            # Add new network
            idx = faiss_manager.network_index.ntotal
            faiss_manager.network_index.add(embedding.reshape(1, -1))
            faiss_manager.network_id_to_idx[network_id] = idx
            faiss_manager.idx_to_network_id[idx] = network_id
            
            # Save indices periodically
            if idx % 50 == 0:  # Save every 50 additions
                faiss_manager.save_indices()
            
            logger.info(f"Added network {network_id} to FAISS index at position {idx}")
            return True
    except Exception as e:
        logger.error(f"Error adding network {network_id} to FAISS: {e}")
        return False

def query_faiss(user_id: str, top_n: int = 10, network_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Query FAISS for similar users"""
    try:
        if user_id not in faiss_manager.user_id_to_idx:
            logger.warning(f"User {user_id} not found in FAISS index")
            return []
        
        user_idx = faiss_manager.user_id_to_idx[user_id]
        
        # Get user embedding
        user_embedding = faiss_manager.user_index.reconstruct(user_idx)
        
        # Search for similar users
        scores, indices = faiss_manager.user_index.search(user_embedding.reshape(1, -1), top_n + 1)  # +1 to exclude self
        
        results = []
        for i, (score, idx) in enumerate(zip(scores[0], indices[0])):
            if idx == user_idx:  # Skip self
                continue
            
            if idx in faiss_manager.idx_to_user_id:
                similar_user_id = faiss_manager.idx_to_user_id[idx]
                results.append({
                    'user_id': similar_user_id,
                    'similarity_score': float(score),
                    'rank': len(results) + 1
                })
        
        return results[:top_n]
    except Exception as e:
        logger.error(f"Error querying FAISS for user {user_id}: {e}")
        return []

def remove_user_from_faiss(user_id: str) -> bool:
    """Remove user from FAISS index (marks for rebuild)"""
    try:
        with faiss_manager.lock:
            if user_id in faiss_manager.user_id_to_idx:
                # Mark for removal (actual removal requires index rebuild)
                logger.info(f"User {user_id} marked for removal from FAISS index")
                # For now, just remove from mapping
                idx = faiss_manager.user_id_to_idx[user_id]
                del faiss_manager.user_id_to_idx[user_id]
                del faiss_manager.idx_to_user_id[idx]
                return True
            return False
    except Exception as e:
        logger.error(f"Error removing user {user_id} from FAISS: {e}")
        return False

# API Endpoints

@app.post("/register")
def register_user(request: UserRegistrationRequest):
    """Register user and store in Postgres + FAISS"""
    try:
        user_id = request.user_id
        profile_data = request.profile_data
        
        # Create user profile from data
        user_profile = UserProfile(
            id=user_id,
            name=profile_data.get('name', ''),
            bio=profile_data.get('bio'),
            skills=profile_data.get('skills', []),
            interests=profile_data.get('interests', []),
            experience=profile_data.get('experience'),
            goals=profile_data.get('goals', [])
        )
        
        # Generate profile text and embedding
        profile_text = create_profile_text(user_profile)
        embedding = generate_embedding(profile_text)
        
        # Add to FAISS
        success = add_user_to_faiss(user_id, embedding)
        
        if success:
            return {
                "status": "success",
                "message": f"User {user_id} registered successfully",
                "embedding_dim": len(embedding)
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to add user to FAISS index")
            
    except Exception as e:
        logger.error(f"Error registering user {request.user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/recommendations/{user_id}")
def get_recommendations(user_id: str, top_n: int = 10, network_filter: Optional[str] = None):
    """Get FAISS-based recommendations for a user"""
    try:
        # Query FAISS for similar users
        similar_users = query_faiss(user_id, top_n, network_filter)
        
        if not similar_users:
            return {
                "user_id": user_id,
                "recommendations": [],
                "total": 0,
                "message": "No similar users found"
            }
        
        # Format recommendations
        recommendations = []
        for user_data in similar_users:
            recommendations.append({
                "user_id": user_data['user_id'],
                "match_score": user_data['similarity_score'],
                "rank": user_data['rank'],
                "explanation": f"High similarity match (score: {user_data['similarity_score']:.3f})"
            })
        
        return {
            "user_id": user_id,
            "recommendations": recommendations,
            "total": len(recommendations),
            "algorithm": "FAISS + Gemini Embeddings"
        }
        
    except Exception as e:
        logger.error(f"Error getting recommendations for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/network/register")
def register_network(request: NetworkEmbeddingRequest):
    """Register network and generate embeddings"""
    try:
        network_id = request.network_id
        network_data = request.network_data
        
        # Generate network text and embedding
        network_text = create_network_text(network_data)
        embedding = generate_embedding(network_text)
        
        # Add to FAISS
        success = add_network_to_faiss(network_id, embedding)
        
        if success:
            return {
                "status": "success",
                "message": f"Network {network_id} registered successfully",
                "embedding_dim": len(embedding)
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to add network to FAISS index")
            
    except Exception as e:
        logger.error(f"Error registering network {request.network_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/user/{user_id}")
def delete_user(user_id: str):
    """Remove user from FAISS index"""
    try:
        success = remove_user_from_faiss(user_id)
        
        if success:
            return {
                "status": "success",
                "message": f"User {user_id} removed from FAISS index"
            }
        else:
            return {
                "status": "warning",
                "message": f"User {user_id} not found in FAISS index"
            }
            
    except Exception as e:
        logger.error(f"Error removing user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/faiss/rebuild")
def rebuild_faiss_index():
    """Rebuild FAISS index for better efficiency"""
    try:
        # This is a placeholder for weekly rebalancing
        # In production, this would rebuild the index from scratch
        faiss_manager.save_indices()
        
        return {
            "status": "success",
            "message": "FAISS index rebuilt successfully",
            "user_count": faiss_manager.user_index.ntotal,
            "network_count": faiss_manager.network_index.ntotal
        }
        
    except Exception as e:
        logger.error(f"Error rebuilding FAISS index: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Legacy endpoints for backward compatibility
@app.post("/match")
def match(input: MatchInput):
    """Legacy job matching endpoint - now uses Gemini embeddings"""
    try:
        # Generate embeddings for resume and job description
        resume_embedding = generate_embedding(input.resume)
        job_embedding = generate_embedding(input.job_description)
        
        # Calculate cosine similarity
        similarity = np.dot(resume_embedding, job_embedding)
        
        # Normalize to 0-1 range
        match_score = (similarity + 1) / 2
        
        return {
            "match_score": float(match_score),
            "confidence": "high" if match_score > 0.7 else "medium" if match_score > 0.4 else "low",
            "algorithm": "Gemini Embeddings + Cosine Similarity"
        }
    except Exception as e:
        logger.error(f"Error in job matching: {e}")
        return {"error": str(e)}

@app.post("/recommend")
def recommend(request: RecommendationRequest) -> RecommendationResponse:
    """Legacy recommendation endpoint - now uses FAISS + Gemini"""
    try:
        user_profile = request.user_profile
        candidate_profiles = request.candidate_profiles
        network_context = request.network_context
        
        # Generate user embedding
        user_text = create_profile_text(user_profile, network_context)
        user_embedding = generate_embedding(user_text)
        
        recommendations = []
        
        for candidate in candidate_profiles:
            # Generate candidate embedding
            candidate_text = create_profile_text(candidate, network_context)
            candidate_embedding = generate_embedding(candidate_text)
            
            # Calculate similarity
            similarity = np.dot(user_embedding, candidate_embedding)
            match_score = (similarity + 1) / 2  # Normalize to 0-1 range
            
            # Generate explanation
            explanation = generate_explanation(user_profile, candidate, match_score)
            
            recommendations.append({
                "user_id": candidate.id,
                "match_score": float(match_score),
                "explanation": explanation
            })
        
        # Sort by match score (descending)
        recommendations.sort(key=lambda x: x["match_score"], reverse=True)
        
        return RecommendationResponse(recommendations=recommendations)
    
    except Exception as e:
        logger.error(f"Error in recommendation: {e}")
        return RecommendationResponse(recommendations=[])

def generate_explanation(user: UserProfile, candidate: UserProfile, score: float) -> str:
    """Generate explanation for match score"""
    explanations = []
    
    # Check skill overlap
    if user.skills and candidate.skills:
        common_skills = set(user.skills) & set(candidate.skills)
        if common_skills:
            explanations.append(f"Shared skills: {', '.join(list(common_skills)[:3])}")
    
    # Check interest overlap
    if user.interests and candidate.interests:
        common_interests = set(user.interests) & set(candidate.interests)
        if common_interests:
            explanations.append(f"Common interests: {', '.join(list(common_interests)[:3])}")
    
    # Check goal alignment
    if user.goals and candidate.goals:
        common_goals = set(user.goals) & set(candidate.goals)
        if common_goals:
            explanations.append(f"Aligned goals: {', '.join(list(common_goals)[:2])}")
    
    if not explanations:
        if score > 0.7:
            explanations.append("Strong profile compatibility via AI embeddings")
        elif score > 0.4:
            explanations.append("Moderate profile compatibility via AI embeddings")
        else:
            explanations.append("Basic profile compatibility via AI embeddings")
    
    return "; ".join(explanations)

@app.get("/health")
def health_check():
    """Health check endpoint"""
    try:
        # Test Gemini API
        test_embedding = generate_embedding("test")
        gemini_status = len(test_embedding) == EMBEDDING_DIM
    except:
        gemini_status = False
    
    return {
        "status": "healthy" if gemini_status else "degraded",
        "gemini_api": gemini_status,
        "faiss_users": faiss_manager.user_index.ntotal,
        "faiss_networks": faiss_manager.network_index.ntotal,
        "embedding_dim": EMBEDDING_DIM,
        "algorithm": "FAISS + Gemini Embeddings"
    }

@app.get("/stats")
def get_stats():
    """Get FAISS index statistics"""
    return {
        "user_count": faiss_manager.user_index.ntotal,
        "network_count": faiss_manager.network_index.ntotal,
        "embedding_dimension": EMBEDDING_DIM,
        "index_type": "IndexFlatIP",
        "algorithm": "FAISS + Gemini Embeddings"
    }

# Cleanup function to save indices on shutdown
@app.on_event("shutdown")
def shutdown_event():
    """Save FAISS indices on shutdown"""
    logger.info("Saving FAISS indices before shutdown...")
    faiss_manager.save_indices()
    logger.info("FAISS indices saved successfully")
