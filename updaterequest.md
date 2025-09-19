Update the system to use FAISS + Gemini embeddings for recommendations instead of the old sentence matching model.

1. Embedding Generation:
   - Integrate Gemini embeddings API (from Google Generative AI).
   - Whenever a user registers or updates their profile:
       a) Generate embeddings for their profile text (bio, goals, interests, etc.).
       b) Store the raw user record in PostgreSQL.
       c) Store the embedding vector in a FAISS index (vector DB).
       d) Ensure FAISS index persists to disk or memory-mapped files so it can reload on startup.

2. Recommendation Logic:
   - On recommendation request:
       a) Pull the requesting user’s embedding.
       b) Query FAISS for top-N nearest neighbors.
       c) Filter results by "network logic" (user must be in same or related network first).
       d) If no strong match is found in the same network, expand search gradually into related/goal-based networks.
       e) For stronger recommendations, estimate how many users across networks share similar embeddings, and return that number to the user as an attention signal.

3. System Enhancements (must NOT break existing infra):
   - Keep all existing caching, queuing, and regeneration logic untouched.
   - Instead of sentence model results, cache FAISS query results + user embeddings.
   - Ensure silent rate limiting is preserved while continuous background search is enhanced.
   - Keep queue workers as is, but allow them to also update FAISS index when user data changes.

4. Extra Requirements:
   - Expose APIs:
       - `/register`: stores user in Postgres + FAISS.
       - `/recommendations/:userId`: runs FAISS query + network filters.
   - Add background job to re-cluster/rebalance FAISS index weekly for better efficiency.
   - Write utility functions for:
       - `generateEmbedding(userData)`
       - `addUserToFAISS(userId, embedding)`
       - `queryFAISS(userId, topN)`

5. Libraries & Setup:
   - Use `faiss` for Python backend.
   - Use `google.generativeai` or REST API for Gemini embeddings.
   - Use `psycopg2` or SQLAlchemy for PostgreSQL integration.
   
Requirements:
1. When a user registers, store profile in Postgres and also generate embeddings with Gemini. Save embeddings in FAISS.
2. On any user profile update, regenerate their embeddings and update FAISS without touching unrelated users.
3. On new network creations or any database change, generate embeddings for the network, store in FAISS, then run FAISS similarity search to recommend the network to the most relevant users.
4. On deletions, remove embeddings from FAISS to keep data in sync.
5. Keep the existing caching, regeneration, and queuing logic untouched but enhance it:
   - Run partial refresh every 5 hours (only updated users/networks).
   - Run full refresh weekly.
6. Recommendation queries should now use FAISS similarity search on Gemini embeddings instead of raw sentence comparison.


Important: DO NOT touch the caching, clear up, regeneration, and queuing logic — only enhance them to work with FAISS results.
