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
from sklearn.metrics.pairwise import cosine_similarity
import torch
import torch.nn as nn
from dotenv import load_dotenv

load_dotenv()

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
        self.lock = asyncio.Lock()
    
    async def initialize_indices(self):
        """Initialize FAISS indices and load existing data"""
        try:
            # Initialize user index
            self.user_index = await asyncio.to_thread(faiss.IndexFlatIP, EMBEDDING_DIM)  # Inner product for cosine similarity
            
            # Initialize network index
            self.network_index = await asyncio.to_thread(faiss.IndexFlatIP, EMBEDDING_DIM)
            
            # Load existing indices if they exist
            if os.path.exists(FAISS_INDEX_PATH + "_users"):
                self.user_index = await asyncio.to_thread(faiss.read_index, FAISS_INDEX_PATH + "_users")
                logger.info(f"Loaded existing user FAISS index with {self.user_index.ntotal} vectors")
            
            if os.path.exists(FAISS_INDEX_PATH + "_networks"):
                self.network_index = await asyncio.to_thread(faiss.read_index, FAISS_INDEX_PATH + "_networks")
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
            self.user_index = await asyncio.to_thread(faiss.IndexFlatIP, EMBEDDING_DIM)
            self.network_index = await asyncio.to_thread(faiss.IndexFlatIP, EMBEDDING_DIM)
    
    async def save_indices(self):
        """Save FAISS indices and mappings to disk"""
        try:
            async with self.lock:
                # Save indices
                await asyncio.to_thread(faiss.write_index, self.user_index, FAISS_INDEX_PATH + "_users")
                await asyncio.to_thread(faiss.write_index, self.network_index, FAISS_INDEX_PATH + "_networks")
                
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
app = FastAPI(title="AI User Matching Engine with FAISS + Gemini")

@app.on_event("startup")
async def startup_event():
    await faiss_manager.initialize_indices()

@app.on_event("shutdown")
async def shutdown_event():
    await faiss_manager.save_indices()

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Input schemas
# Data Models
# Removed MatchInput - this system is for user matching only, not job matching

class UserProfile(BaseModel):
    id: str
    name: str
    bio: Optional[str] = None
    interests: Optional[List[str]] = []
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
        # Use the correct Gemini embedding API
        result = genai.embed_content(
            model="models/embedding-001",
            content=text,
            task_type="retrieval_document"
        )
        embedding = np.array(result['embedding'], dtype=np.float32)
        # Normalize for cosine similarity
        embedding = embedding / np.linalg.norm(embedding)
        logger.info(f"Generated embedding with shape: {embedding.shape}")
        return embedding
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        # Fallback to random embedding (should not happen in production)
        fallback = np.random.random(EMBEDDING_DIM).astype(np.float32)
        fallback = fallback / np.linalg.norm(fallback)
        return fallback

def enhance_compatibility_score(user: UserProfile, candidate: UserProfile, base_score: float, network_context: Optional[NetworkContext] = None) -> float:
    """
    Enhance compatibility score with additional factors
    """
    try:
        enhanced_score = base_score
        
        # Interest overlap bonus
        user_interests = set(user.interests or [])
        candidate_interests = set(candidate.interests or [])
        if user_interests and candidate_interests:
            overlap = len(user_interests.intersection(candidate_interests))
            total_interests = len(user_interests.union(candidate_interests))
            if total_interests > 0:
                interest_bonus = (overlap / total_interests) * 0.1
                enhanced_score += interest_bonus
        
        # Goal alignment bonus
        user_goals = set(user.goals or [])
        candidate_goals = set(candidate.goals or [])
        if user_goals and candidate_goals:
            goal_overlap = len(user_goals.intersection(candidate_goals))
            total_goals = len(user_goals.union(candidate_goals))
            if total_goals > 0:
                goal_bonus = (goal_overlap / total_goals) * 0.15
                enhanced_score += goal_bonus
        
        # Network context bonus
        if network_context and network_context.goals:
            network_goals = set(network_context.goals)
            user_network_alignment = len(user_goals.intersection(network_goals)) if user_goals else 0
            candidate_network_alignment = len(candidate_goals.intersection(network_goals)) if candidate_goals else 0
            
            if user_network_alignment > 0 and candidate_network_alignment > 0:
                network_bonus = min(user_network_alignment, candidate_network_alignment) * 0.05
                enhanced_score += network_bonus
        
        # Ensure score stays within reasonable bounds
        return min(enhanced_score, 1.0)
    except Exception as e:
        logger.error(f"Error enhancing compatibility score: {e}")
        return base_score

def create_profile_text(profile: UserProfile, network_context: Optional[NetworkContext] = None) -> str:
    """Convert user profile to text for embedding generation"""
    text_parts = []
    
    if profile.name:
        text_parts.append(f"Name: {profile.name}")
    
    if profile.bio:
        text_parts.append(f"Bio: {profile.bio}")
    

    
    if profile.interests:
        text_parts.append(f"Interests: {', '.join(profile.interests)}")
    
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

async def add_user_to_faiss(user_id: str, embedding: np.ndarray) -> bool:
    """Add user embedding to FAISS index"""
    try:
        async with faiss_manager.lock:
            # Check if user already exists
            if user_id in faiss_manager.user_id_to_idx:
                logger.info(f"User {user_id} already exists in FAISS, skipping.")
                return True

            # Add new user
            idx = faiss_manager.user_index.ntotal
            await asyncio.to_thread(faiss_manager.user_index.add, embedding.reshape(1, -1))
            faiss_manager.user_id_to_idx[user_id] = idx
            faiss_manager.idx_to_user_id[idx] = user_id

            logger.info(f"Added user {user_id} to FAISS index at position {idx}")
            return True
    except Exception as e:
        logger.error(f"Error adding user {user_id} to FAISS: {e}")
        return False


async def add_network_to_faiss(network_id: str, embedding: np.ndarray) -> bool:
    """Add network embedding to FAISS index"""
    try:
        async with faiss_manager.lock:
            # Check if network already exists
            if network_id in faiss_manager.network_id_to_idx:
                logger.info(f"Network {network_id} already exists in FAISS, skipping.")
                return True

            # Add new network
            idx = faiss_manager.network_index.ntotal
            await asyncio.to_thread(faiss_manager.network_index.add, embedding.reshape(1, -1))
            faiss_manager.network_id_to_idx[network_id] = idx
            faiss_manager.idx_to_network_id[idx] = network_id

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

# User matching and recommendation endpoints
# User recommendation endpoint
@app.post("/recommend", response_model=RecommendationResponse)
async def recommend(request: RecommendationRequest):
    """
    Receives a user profile and a list of candidate profiles,
    and returns a ranked list of recommended candidates based on compatibility.
    """
    logger.info("Received recommendation request")
    user_profile = request.user_profile
    candidate_profiles = request.candidate_profiles
    network_context = request.network_context
    
    logger.info(f"User profile: {user_profile.id}, Number of candidates: {len(candidate_profiles)}")

    try:
        # Generate embedding for the user profile
        logger.info("Generating embedding for user profile...")
        user_text = create_profile_text(user_profile, network_context)
        user_embedding = await asyncio.to_thread(generate_embedding, user_text)
        logger.info("User profile embedding generated successfully")

        # Generate embeddings for candidate profiles in parallel
        logger.info("Generating embeddings for candidate profiles...")
        
        async def generate_candidate_embedding(candidate):
            logger.info(f"Processing candidate {candidate.id}")
            candidate_text = create_profile_text(candidate, network_context)
            embedding = await asyncio.to_thread(generate_embedding, candidate_text)
            logger.info(f"Finished processing candidate {candidate.id}")
            return candidate.id, embedding

        embedding_tasks = [generate_candidate_embedding(c) for c in candidate_profiles]
        candidate_embeddings_results = await asyncio.gather(*embedding_tasks)
        
        candidate_embeddings = {cand_id: emb for cand_id, emb in candidate_embeddings_results}
        logger.info("Candidate profile embeddings generated successfully")

        # Calculate cosine similarity
        recommendations = []
        for cand_id, cand_embedding in candidate_embeddings.items():
            candidate_profile = next((c for c in candidate_profiles if c.id == cand_id), None)
            if candidate_profile:
                # Cosine similarity
                similarity = cosine_similarity(user_embedding.reshape(1, -1), cand_embedding.reshape(1, -1))[0][0]
                
                # Enhance score with other factors
                enhanced_score = enhance_compatibility_score(user_profile, candidate_profile, similarity, network_context)
                
                recommendations.append({
                    "user_id": cand_id,
                    "score": float(enhanced_score),
                    "name": candidate_profile.name,
                    "bio": candidate_profile.bio
                })

        # Sort recommendations by score
        recommendations.sort(key=lambda x: x["score"], reverse=True)

        return RecommendationResponse(recommendations=recommendations)

    except Exception as e:
        logger.error(f"Error during recommendation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate recommendations")

def create_profile_text(profile: UserProfile, network_context: Optional[NetworkContext] = None) -> str:
    """
    Create a comprehensive text representation of a user profile
    """
    text_parts = []
    
    # Basic info
    text_parts.append(f"Name: {profile.name}")
    
    if profile.bio:
        text_parts.append(f"Bio: {profile.bio}")
    
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
        return "Good match with complementary interests and goals"
    elif score > 0.4:
        return "Moderate match with some shared interests"
    else:
        return "Basic compatibility"

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/add_user_embedding")
async def add_user_embedding(request: EmbeddingRequest):
    """
    Add user embedding to FAISS index
    """
    try:
        user_id = request.user_id
        user_data = request.user_data
        
        # Create UserProfile from user_data
        profile = UserProfile(
            id=user_id,
            name=user_data.get('name', ''),
            bio=user_data.get('bio', ''),
            interests=user_data.get('interests', []),
            goals=user_data.get('goals', [])
        )
        
        # Generate embedding
        profile_text = create_profile_text(profile)
        embedding = await asyncio.to_thread(generate_embedding, profile_text)
        
        # Add to FAISS
        success = await add_user_to_faiss(user_id, embedding)
        
        return {
            "success": success,
            "user_id": user_id,
            "embedding_shape": embedding.shape
        }
    except Exception as e:
        logger.error(f"Error adding user embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query_similar_users")
async def query_similar_users(request: FAISSQueryRequest):
    """
    Query FAISS for similar users
    """
    try:
        results = query_faiss(request.user_id, request.top_n, request.network_filter)
        return {
            "user_id": request.user_id,
            "similar_users": results
        }
    except Exception as e:
        logger.error(f"Error querying similar users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/remove_user_embedding/{user_id}")
def remove_user_embedding(user_id: str):
    """
    Remove user embedding from FAISS index
    """
    try:
        success = remove_user_from_faiss(user_id)
        return {
            "success": success,
            "user_id": user_id
        }
    except Exception as e:
        logger.error(f"Error removing user embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/faiss_stats")
def get_faiss_stats():
    """
    Get FAISS index statistics
    """
    try:
        user_count = faiss_manager.user_index.ntotal if faiss_manager.user_index else 0
        network_count = faiss_manager.network_index.ntotal if faiss_manager.network_index else 0
        
        return {
            "user_embeddings_count": user_count,
            "network_embeddings_count": network_count,
            "embedding_dimension": EMBEDDING_DIM,
            "user_mappings": len(faiss_manager.user_id_to_idx),
            "network_mappings": len(faiss_manager.network_id_to_idx)
        }
    except Exception as e:
        logger.error(f"Error getting FAISS stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/save_indices")
async def save_indices():
    """
    Save the FAISS indices to disk.
    """
    try:
        await faiss_manager.save_indices()
        return {"status": "Indices saved successfully"}
    except Exception as e:
        logger.error(f"Error saving FAISS indices: {e}")
        raise HTTPException(status_code=500, detail="Failed to save indices")
