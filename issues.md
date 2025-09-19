# issue 16
# 🧵 [ISSUE] Recommend Users via AI model
## Description
Implement a **standalone, continuously running recommendation service** using the existing HuggingFace transformer model.  
The system computes **accurate, real-time or near-real-time recommendations** based on user profile, interests, goals, and recent posts.  

All recommendations and match scoring should be **restricted to users within the same network**.  
The system must **both listen to server events in real-time** and **run its own periodic job**, ensuring recommendations are always fresh, relevant, and on-spot.

---

## Behavior / Flow

1. **Manual Trigger**
   - Users click “More Recommendations” (captured as an event).  
   - If no new recommendations are available, return **cached suggestions**.  
   - Only recommend users **from the same network** as the current user.

2. **Offline Users**
   - If the user is offline, optionally send **email notifications** with top recommendations (for testing/debugging).  
   - Only include users from the same network.

3. **Recommendation Logic**
   - For each pair of users **within the same network**, send `current_user` and `other_user` to the transformer model.  
   - Accept matches with **score ≥ 80** only.  
   - Cache top matches in **Redis** until **10 users** are collected.  
   - Persist old recommendations in **database** to avoid duplicates.  

4. **Online Recommendations**
   - Previously made but unacted recommendations remain available.  
   - Update them when **user data changes** or new matches are found.  
   - Always restrict recommendations to **same network** users.

5. **Periodic Job**
   - Run a scheduled job to refresh recommendations for active users.  
   - Recompute or bump recommendations as necessary, independent of new events.  
   - Still **restricted to users within the same network**.

6. **Offline/Online Hybrid**
   - Recommendations computed both **offline (batch)** and **online (real-time)**, using event triggers and periodic job.  
   - **Network restriction enforced** in all cases.

---

## Implementation Steps

### Step 1: Event Trigger Listener
- Listen for **user data changes, manual triggers, or network updates** via Kafka or Redis Streams.  
- Only process **users within the same network**.  
- Send affected user IDs to the transformer model.

### Step 2: Incremental Scoring
- Compute **match scores** for affected user pairs **within the same network**.  
- Only store matches **≥ 80** in Redis.  
- Track which recommendations have already been served in the database.

### Step 3: Periodic Job
- Run a scheduled job to refresh recommendations for active users.  
- Only compute matches **among users in the same network**.  
- Update cache and database accordingly.

### Step 4: Caching & Persistence
- Maintain **top-N recommendations** in Redis.  
- Persist **old recommendations** in database.  
- Serve cached recommendations if no new matches are found.  

### Step 5: Notification & Delivery
- Optionally push updates via **WebSocket** or send **email notifications** for offline users (for testing/debugging).  
- Recommendations remain valid until acted on or updated due to new data.  
- Always ensure **network restriction** is enforced.

---

## Acceptance Criteria
- [ ] Recommendations and match scoring **only include users from the same network**.  
- [ ] Standalone service continuously listens to **server events** and runs **its own periodic job**.  
- [ ] Manual triggers compute fresh recommendations; fallback to cached suggestions if none.  
- [ ] Recommendations include **top 10 users** with match score ≥ 80.  
- [ ] Previous recommendations are stored in **database** to avoid repeats.  
- [ ] Offline notifications (email) work for testing/debugging.  
- [ ] Online notifications via WebSocket optional for testing/debugging.  
- [ ] Recommendations update dynamically based on user data changes **within the network**.  
- [ ] Service is efficient and scalable, computing only affected user pairs.

---

## Notes
- Fully **standalone background service**; no server endpoint or UI required.  
- Uses Kafka or Redis Streams for **event-driven updates** to update the user with the new recommendations.  
- Runs **periodic background job** to ensure freshness even without events.  
- Transformer model computes **match scores**; ranking/top-N handled in Redis.  
- Privacy rules and network membership enforced before delivering recommendations.  





# 35
# Network deletion and connection control
## Description
Restrict the ability to **delete a network** to only the **creator** and **admins** of that network.  

When a network is deleted, user connections should be updated according to whether they were **saved (mutual/bi-directional)** or not:  

- Users with **unsaved connections** (connections established only through the network, not mutual) will be **disconnected** and can no longer send private messages.  
- These disconnected users may still **send new connection requests** to reconnect even after the network is deleted (does not depend on whether a network exis      ts).  
- Users with **saved mutual (bi-directional) connections** will **remain connected** even after the network is deleted.  
- If the connection was **one-sided** (only one user saved the other), the connection will be **disconnected** and a new request must be initiated.  

---

## Acceptance Criteria
- [ ] Only **network creator** and **admins** can delete a network.  
- [ ] On network deletion:  
  - [ ] All users with **unsaved connections** are disconnected.  
  - [ ] Disconnected users cannot send private messages.  
  - [ ] Disconnected users can **send new connection requests** to reconnect, even if the network no longer exists.  
  - [ ] All users with **mutual (bi-directional) saved connections** remain connected.  
  - [ ] If only one user saved the other, the connection is disconnected and requires a new request.  
- [ ] **New connection requests after deletion do not depend on an existing network**.  

---

## Notes
- Private messages should automatically become unavailable for disconnected users immediately after network deletion.  
- Reconnection requests must follow the same approval flow as normal connection requests.  
- This ensures **users have a chance to reconnect even after network closure**, while preventing one-sided or unsaved connections from persisting.  






# 11
# 🔗 [ISSUE 11] Send & Manage Connection Requests
### Description:
Users can send, accept, or reject connection requests within a network.
user can restrict connection requests to only users in the same network/non/ verified users only/ make it publie any one can send them connection requests.
 
### Acceptance Criteria:

- [ ]  POST to send request (must be in same network or once been in the same network because)
- [ ]  PATCH to accept/reject
- [ ]  Store connection in a join table





# issue 20
# 📁 [ISSUE] Save & List Connections (Followers)

### Description:
Allow users to follow (save) others in their network.

### Acceptance Criteria:

- [ ]  POST to save someone as a follower
- [ ]  GET list of saved users
- [ ] Post to delete user saved connections



# 36
# Network Suspending instead of deleting
## Description
Implement a **network suspension system** instead of network deletion.  
Currently, network deletion is not yet implemented, so when a creator or admin requests to remove a network, it should enter a **suspended state** rather than being deleted.  

### Suspension Lifecycle
1. When a creator/admin requests removal, the network is **suspended** for **28 days** (temporary suspension).  
2. During this suspension period, the creator/admin can **reclaim the network** by revoking the suspension request with a valid token.  
3. If no reclaim occurs within 28 days, the network becomes **permanently suspended** (flagged forever, not deleted).  

### Effects of Suspension
- The network is **not joinable**.  
- The network is **not searchable**.  
- The network is **not recommended** anywhere in the platform.  
- The **name of the network is appended with `(suspended)`**.  
- All existing members remain in the network but cannot interact in it.  

### Visibility Rules
- **Temporary Suspension (28-day window):**  
  - The network is **filtered out** of the **user’s networks list**.  
  - **Admins/creator** can still see the network in their dashboards and manage it (e.g., reclaim or confirm suspension).  

- **Permanent Suspension (after 28 days, no reclaim):**  
  - The network is **filtered out** of both **user networks** and **admin dashboards**.  
  - It remains in the system flagged as permanently suspended (for records), but it is no longer visible in normal requests.  

---

## Acceptance Criteria
- [ ] Only **network creator** or **admins** can initiate suspension.  
- [ ] Suspension lasts **28 days**, after which the network becomes **permanently suspended** if not reclaimed.  
- [ ] Creator/admin can **reclaim** a suspended network during the 28-day period using a secure token.  
- [ ] Temporarily suspended networks:  
  - [ ] Hidden from users’ networks list.  
  - [ ] Still visible to admins/creator for management and reclaim.  
- [ ] Permanently suspended networks:  
  - [ ] Filtered out from both user and admin networks.  
  - [ ] Remain flagged in the system (not deleted).  
  - [ ] Cannot be joined, searched, or recommended.  
  - [ ] Name is appended with `(suspended)`.  
  - [ ] Visible only through special admin record-keeping tools (not normal dashboards).  
- [ ] Notifications are sent to the network creator/admin when:  
  - [ ] Suspension starts.  
  - [ ] The 28-day reclaim period is close to expiring.  

---

## Notes
- This introduces the **first lifecycle for network removal**, designed as a **soft-delete (suspension)** instead of hard deletion.  
- **Temporary suspension** = recoverable, only hidden from users.  
- **Permanent suspension** = effectively removed from active use, hidden from both users and admins, but still stored in the system.  
- Reclaiming restores full functionality and removes the `(suspended)` tag.  




# 37
# Network match and searching

## Description
In the **continuously running recommendation service** using the existing transformer model.  
The system provides:

 
1. **Cross-network discovery**: estimates potential matches in other networks to suggest new networks for users.  

Features include **manual triggers, silent rate limiting, optimized search strategies, and periodic refresh**, ensuring recommendations are always fresh and efficient.

---

## Behavior / Flow

### 1. Cross-Network Discovery
- **Manual trigger** (“Load More Networks”) allows the user to see additional networks.  
- **Silent rate limiting** ensures the system does not overload when fetching multiple networks.  
- **Optimized search strategy**:
  - Start from **users in common/shared networks and  user connections**.  
  - Check which **other networks** those users belong to.  
  - Sample users  from these networks and compute match scores with the current user.  
- Return an **estimated number of potential matches per network** to help the user decide which network to join.  
- Periodic job keeps cross-network estimates **fresh and updated**.

### 2. Offline & Online Handling
- Offline users can optionally receive **email notifications** with top recommendations.  
- Online users can optionally receive updates via **WebSocket**.  
- Recommendations remain valid until acted on or updated by new data.

### 3. Recommendation Logic
- Only matches with **score ≥ 80** are accepted.  
- Cache top matches in **Redis** until **10 networks** are collected.  
- Persist old recommendations in **database** to prevent repeats.  

### 4. Periodic Job
- Continuously refresh  **cross-network estimates**, independent of new events.  

---

## Implementation Steps

### Step 1: Event Trigger Listener
- Listen for **user updates, manual triggers, network events** via Kafka or Redis Streams.  
- Process **cross-network estimations**.

### Step 2: Incremental Scoring
- Compute **match scores** for affected user pairs **within the same network**.  
- For cross-network discovery, compute **estimated matches** based on sampled users in other networks.  
- Only store matches **≥ 80** in Redis.  
- Track previously served recommendations in database.

### Step 3: Rate Limiting & Optimization
- Apply **silent rate limiting** to avoid overload on manual triggers or periodic refresh.  
- Use **shared/common users as a starting point** for cross-network search to minimize computation.  

### Step 4: Caching & Persistence
- Maintain **top-N recommendations** in Redis.  
- Persist **old recommendations** in database.  
- Serve cached results if no new matches are found.

### Step 5: Notification & Delivery
- Push updates via **WebSocket** or send **email** for offline users .  
- Recommendations remain valid until acted on or updated due to new data.  

---

## Acceptance Criteria
- [ ] Recommendations **only include users from the same network**.  
- [ ] Cross-network discovery provides **estimated match counts** for additional networks.  
- [ ] Users can manually **load more networks**.  
- [ ] Silent rate limiting prevents system overload during manual triggers or periodic refresh.  
- [ ] Optimized search starts from **shared/common users** to efficiently find candidate networks.  
- [ ] Standalone service continuously listens to events and runs **its own periodic job**.  
- [ ] Recommendations include **top 10 networks** with match score ≥ 80.  
- [ ] Previous recommendations are stored in **database** to avoid duplicates.  
- [ ] Offline notifications (email) .  
- [ ] Online notifications via WebSocket optional for testing/debugging.  
- [ ] Recommendations and cross-network estimates update dynamically based on **user/network data changes**.  
- [ ] Service is efficient, scalable, and computes only affected user pairs/networks.

---

## Notes
- Fully **standalone background service**; no server endpoint or UI required.  
- Uses Kafka or Redis Streams for **event-driven updates** to update the user for the lated recommendations.  
- Runs **periodic background job** for both in-network recommendations and cross-network estimates.  
- Transformer model computes **match scores**; ranking/top-N handled in Redis.  
- Privacy rules and network membership enforced before delivering recommendations.  
