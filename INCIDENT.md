# On-Call Incident Runbook: Conversation Context Loss and Response Slowdown

This document outlines the operational walk-through, root cause analysis, and remedy steps for the following production incident:
* **Symptom 1**: Users report that the AI assistant "forgets" information they provided earlier in the chat (e.g. 10 minutes ago).
* **Symptom 2**: AI chat reply times have degraded, taking up to **12 seconds** to respond.

---

## 🔍 Step 1: Cause Identification (Triage Workflow)

As the engineer on call, here is how we trace these symptoms back to our system design:

### 1. Root Cause of Context Loss ("Forgetting" Answers)
Looking at our chat context query inside `chat.service.ts` (line 47):
```typescript
const messagesContext = await this.db.query(
  'SELECT role, message FROM messages WHERE will_id = $1 ORDER BY id DESC LIMIT 10',
  [willId]
);
```
* **The Context Limit**: Our prompt construction limits the conversation context sent to the OpenAI API to the **last 10 messages** (5 complete user-assistant turns).
* **Why the AI forgets**: 
  - If a user spends more than 5 turns chatting (e.g., correcting spelling, explaining their assets, or asking questions), their early messages (like their full name or age) **fall out of the `LIMIT 10` window** and are no longer sent to OpenAI.
  - While our design passes the current *Database State* of the Will to the prompt (which acts as a persistent memory), if the AI **failed to parse and extract** that early information into the database fields (due to structured JSON syntax mismatch or invalid inputs), the data resides *only* in the chat history. Once that history rolls off the `LIMIT 10` window, the AI has no knowledge of it, causing the "forgetting" symptom.

### 2. Root Cause of Response Slowdown (12-second Latency)
The backend chat handler performs sequential blocking steps:
1. Fetching the will draft.
2. Saving the user message to the database.
3. Fetching the last 10 messages from `messages`.
4. Triggering the external OpenAI HTTPS request.
5. Deleting and re-inserting assets/beneficiaries arrays (database transaction).
6. Saving the assistant reply.

* **Database Bottleneck**:
  - Examining `schema.sql`, we see that the foreign key column `messages.will_id` does not have an index.
  - As users talk to the AI, the `messages` table grows. Without an index on `will_id`, every chat request triggers a **full sequential table scan** (`Seq Scan`) to retrieve the message history or to link wills, which locks database threads.
* **OpenAI API Timeout & Network Latency**:
  - The API connection is executed without client timeouts, meaning high API traffic or network spikes block the NestJS event loop waiting on TCP sockets.
* **PostgreSQL Connection Pool Contention**:
  - If the database query times grow, connections inside the `pg` pool are held open longer. Subsequent requests queue up waiting for an open database connection, creating a cascading response delay.

---

## 🛠️ Step 2: Implementation of Fixes (Remedies)

To resolve the symptoms permanently while preserving our architecture, we implement the following three code fixes:

### Fix A: Database Indexing to Remove Query Latency
We create explicit indexes on the foreign key columns in `schema.sql` (specifically `messages(will_id)`) to speed up chronological lookups from $O(N)$ sequential scans to $O(\log N)$ index scans:

```sql
-- Create index to optimize chat history queries and joins
CREATE INDEX IF NOT EXISTS idx_messages_will_id ON messages(will_id);
CREATE INDEX IF NOT EXISTS idx_wills_user_id ON wills(user_id);
```

### Fix B: Resilient Context Window & State Guard
To ensure the AI never forgets answers given in long conversations:
1. **Increase History Context Window**: Increase the query limit from `10` to `20` messages to hold longer conversational tangents.
2. **Prioritize Extracted Database State**: Since our system prompt injects the verified database state (representing compiled will values), we instruct the AI system prompt to refer to the `Current Database State of the Will` as the primary ground truth. If data exists in the database state, the AI will never re-ask for it even if history rolls off.

### Fix C: Network Sockets & Event Loop Protections
We configure a request timeout (e.g., 6 seconds) on the OpenAI API client to prevent hung connections from blocking server threads indefinitely:

```typescript
this.openai = new OpenAI({ 
  apiKey,
  timeout: 6000 // 6 seconds timeout
});
```

---

## 📋 Step 3: Verification Post-Incident
1. Run `EXPLAIN ANALYZE` on the history retrieval query:
   ```sql
   EXPLAIN ANALYZE SELECT role, message FROM messages WHERE will_id = 1 ORDER BY id DESC LIMIT 20;
   ```
   *Verify that the planner chooses `Index Scan using idx_messages_will_id` and query execution time drops to < 1ms.*
2. Monitor HTTP response metrics on `/chat` to confirm response times return to normal (~1.5–2 seconds, bounded by external OpenAI latency).
