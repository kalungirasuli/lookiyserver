from fastapi import FastAPI
from pydantic import BaseModel
import torch
import torch.nn as nn
from sentence_transformers import SentenceTransformer
import numpy as np
import joblib

# Load config
cfg = joblib.load("jobmatch_model/config.pkl")
input_dim = cfg["input_dim"]

# Define model
class MatchNet(nn.Module):
    def __init__(self, input_dim):
        super(MatchNet, self).__init__()
        self.seq = nn.Sequential(
            nn.Linear(input_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.seq(x)

# Load model
model = MatchNet(input_dim)
model.load_state_dict(torch.load("jobmatch_model/matchnet.pth", map_location=torch.device("cpu")))
model.eval()

# Load embedder
encoder = SentenceTransformer("jobmatch_model/encoder")

# FastAPI
app = FastAPI()

class MatchInput(BaseModel):
    resume: str
    job_description: str
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# Load the SentenceTransformer
encoder = SentenceTransformer("jobmatch_model/encoder")  # adjust path if needed

# FastAPI instance
app = FastAPI(title="Job Matching Engine (Cosine Similarity)")

# Input schema
class MatchInput(BaseModel):
    resume: str
    job_description: str

# Endpoint
@app.post("/match")
def match(input: MatchInput):
    # Embed both inputs
    resume_vec = encoder.encode(input.resume, convert_to_numpy=True)
    job_vec = encoder.encode(input.job_description, convert_to_numpy=True)

    # Compute cosine similarity
    score = cosine_similarity([resume_vec], [job_vec])[0][0]

    return {"match_score": round(float(score), 4)}

@app.post("/match")
def match(input: MatchInput):
    resume_vec = encoder.encode(input.resume, convert_to_numpy=True)
    job_vec = encoder.encode(input.job_description, convert_to_numpy=True)
    combined = np.concatenate([resume_vec, job_vec])
    tensor = torch.tensor(combined, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        score = model(tensor).item()
    return {"match_score": round(score, 4)}
