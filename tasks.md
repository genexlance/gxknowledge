# Tasks

- [x] Initialize project structure (frontend + Netlify Functions)
- [x] Configure Tailwind and design system per PRD (base styles, font, colors)
- [x] Implement chat API function (stub)
- [x] Build chat UI shell (messages, input, send)
- [x] Configure environment variables and netlify.toml
- [x] Add XML ingestion script (stub)
- [x] Wire Pinecone + DeepSeek clients (real APIs with local fallbacks)
- [x] Implement vector search in chat function (queries Pinecone)
- [x] Source links open a modal and load full content via proxy (with <base> tag for relative URLs)
- [x] Improve search relevance and conversational answers (hybrid re-ranking, explain source relevance)
- [ ] Admin panel scaffold (auth, routes)
- [ ] Deploy preview on Netlify

## Retrieval Augmented Generation (RAG)

- [x] Implement RAG baseline
  - Ingest `originalDATA.xml` → chunk → embed with DeepSeek → upsert to Pinecone
  - Hybrid retrieval in `netlify/functions/chat.js`: lexical prefilter + vector search + hybrid re-score
- [x] Improve chunking fidelity (sentence-aware splitting with overlap)
- [x] Add Max Marginal Relevance (MMR) diversification across all chunks (beyond parent cap)
- [x] Dynamic `topK` and score thresholds based on query length/complexity
- [x] Query expansion (synonyms and tag/category boosts) before retrieval
- [x] Optional LLM rewrite of the query for retrieval only (keep original for display)
- [x] Add learned field weights (title/slug/category/tags/content) via config
- [x] Plug-in reranker hook (provider-agnostic) on the top 30 candidates
- [x] Short-term cache for query embeddings to reduce latency/cost
- [x] Telemetry hook to log retrieval diagnostics
