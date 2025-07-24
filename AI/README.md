
## README: JobMatch – AI-Powered Job Matching Engine

Overview

JobMatch is an AI-driven job matching engine designed to intelligently evaluate how well a candidate’s resume aligns with a job description.

Unlike traditional systems that rely on simple keyword matching, JobMatch employs advanced natural language understanding (NLU) techniques to comprehend the true meaning of both resumes and job listings.

System Inputs

The system processes two key inputs:
1. Resume – Provided by the job seeker.
2. Job Description – Supplied by the employer or job platform.

Both inputs are converted into "meaning vectors" using a pretrained language model. These vectors encapsulate the overall intent, skills, and context of each text.

Similarity Calculation

- The system uses Matcnet, a neural model, to evaluate the semantic alignment between the resume and the job description.
- A match score ranging from 0 to 1 is generated, reflecting the degree of compatibility.


## 🔧 How It Works

1. Resume and job description are converted into 384-dimensional sentence embeddings using `MiniLM-L6-v2`.
2. Embeddings are concatenated and passed into a custom 3-layer neural network (MatchNet).
3. The model returns a probability score indicating how well the resume fits the job.

---

## 💻 Running the API

### 1. Install Dependencies


pip install -r requirements.txt


## Sample Request

{
  "resume": "Backend developer with Django and PostgreSQL experience.",
  "job_description": "Looking for a Python engineer with Django and REST API knowledge."
}


## Response

{
  "match_score": 0.8431
}

## Match Score Interpretation
Score Range	Interpretation
0.70–1.00	⭐ Excellent Match
0.50–0.69	✅ Good Match
0.30–0.49	⚠️ Weak Match
0.00–0.29	❌ Poor Match