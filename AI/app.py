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

# Job matching endpoint
@app.post("/match")
def match(input: MatchInput):
    resume_vec = encoder.encode(input.resume, convert_to_numpy=True)
    job_vec = encoder.encode(input.job_description, convert_to_numpy=True)
    
    if use_neural_model:
        # Use neural network model
        combined = np.concatenate([resume_vec, job_vec])
        tensor = torch.tensor(combined, dtype=torch.float32).unsqueeze(0)
        with torch.no_grad():
            score = model(tensor).item()
    else:
        # Use cosine similarity
        score = cosine_similarity([resume_vec], [job_vec])[0][0]
    
    return {"match_score": round(float(score), 4)}

# User recommendation endpoint
@app.post("/recommend")
def recommend(request: RecommendationRequest) -> RecommendationResponse:
    """
    Generate user recommendations based on profile similarity
    """
    user_profile = request.user_profile
    candidates = request.candidate_profiles
    network_context = request.network_context
    
    if not candidates:
        return RecommendationResponse(recommendations=[])
    
    # Create user profile text
    user_text = create_profile_text(user_profile, network_context)
    user_embedding = encoder.encode(user_text, convert_to_numpy=True)
    
    recommendations = []
    
    for candidate in candidates:
        # Create candidate profile text
        candidate_text = create_profile_text(candidate, network_context)
        candidate_embedding = encoder.encode(candidate_text, convert_to_numpy=True)
        
        # Calculate similarity
        if use_neural_model:
            # Use neural network for more sophisticated matching
            combined = np.concatenate([user_embedding, candidate_embedding])
            tensor = torch.tensor(combined, dtype=torch.float32).unsqueeze(0)
            with torch.no_grad():
                match_score = model(tensor).item()
        else:
            # Use cosine similarity
            match_score = cosine_similarity([user_embedding], [candidate_embedding])[0][0]
        
        recommendations.append({
            "user_id": candidate.id,
            "match_score": round(float(match_score), 4),
            "explanation": generate_explanation(user_profile, candidate, match_score)
        })
    
    # Sort by match score (highest first)
    recommendations.sort(key=lambda x: x["match_score"], reverse=True)
    
    return RecommendationResponse(recommendations=recommendations)

def create_profile_text(profile: UserProfile, network_context: Optional[NetworkContext] = None) -> str:
    """
    Create a comprehensive text representation of a user profile
    """
    text_parts = []
    
    # Basic info
    text_parts.append(f"Name: {profile.name}")
    
    if profile.bio:
        text_parts.append(f"Bio: {profile.bio}")
    
    if profile.experience:
        text_parts.append(f"Experience: {profile.experience}")
    
    # Skills
    if profile.skills:
        text_parts.append(f"Skills: {', '.join(profile.skills)}")
    
    # Interests
    if profile.interests:
        text_parts.append(f"Interests: {', '.join(profile.interests)}")
    
    # Goals
    if profile.goals:
        text_parts.append(f"Goals: {', '.join(profile.goals)}")
    
    # Network context
    if network_context:
        text_parts.append(f"Network: {network_context.name}")
        if network_context.description:
            text_parts.append(f"Network Description: {network_context.description}")
        if network_context.goals:
            text_parts.append(f"Network Goals: {', '.join(network_context.goals)}")
    
    return " ".join(text_parts)

def generate_explanation(user: UserProfile, candidate: UserProfile, score: float) -> str:
    """
    Generate a simple explanation for the match
    """
    if score > 0.8:
        return "Excellent match based on shared interests and goals"
    elif score > 0.6:
        return "Good match with complementary skills and interests"
    elif score > 0.4:
        return "Moderate match with some shared interests"
    else:
        return "Basic compatibility"

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "model_loaded": use_neural_model,
        "encoder_loaded": encoder is not None
    }
