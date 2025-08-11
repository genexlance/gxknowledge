Product Requirements Document
The Genex Marketing Knowledge Garden
Version: 1.0
Date: August 10, 2025
Status: Draft

1. Executive Summary
The Genex Marketing Knowledge Garden is a knowledge management system that leverages vector database technology to create an intelligent, searchable repository of marketing knowledge. The system allows users to query marketing information using natural language and administrators to continuously expand the knowledge base.
Key Features

Vector-based semantic search using Pinecone and DeepSeek embeddings
ChatGPT-style conversational interface
Admin panel for knowledge base management
XML data ingestion pipeline


2. Project Overview
2.1 Objectives

Transform unstructured marketing data from XML format into searchable vector embeddings
Provide intuitive natural language interface for knowledge retrieval
Enable continuous knowledge base expansion through admin interface
Maintain high-quality, relevant search results through semantic understanding

2.2 Target Users

End Users: Marketing professionals seeking quick access to company knowledge
Administrators: Content managers responsible for maintaining and expanding the knowledge base

2.3 Success Metrics

Query response time < 2 seconds
Search relevance score > 85%
System uptime > 99.9%
User satisfaction rating > 4.5/5


3. Technical Architecture
3.1 Technology Stack
Backend

Runtime: Node.js (v20+) or Python (3.10+)
Framework: Express.js/FastAPI
Vector Database: Pinecone
Embeddings: DeepSeek API
Environment Management: dotenv

Frontend

Framework: React.js or Next.js
UI Components: Tailwind CSS + shadcn/ui or Material-UI
State Management: React Context API or Zustand
API Communication: Axios or Fetch API

Infrastructure

Deployment: Vercel/Netlify (Frontend), Railway/Render (Backend)
Authentication: JWT tokens or NextAuth.js
Rate Limiting: Express-rate-limit or similar

3.2 System Architecture
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Chat Interface │────▶│   Backend API    │────▶│    Pinecone     │
│    (React)      │     │  (Node)   │     │  Vector DB      │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                          ▲
┌─────────────────┐            │                          │
│                 │            │                          │
│  Admin Panel    │────────────┘                          │
│    (React)      │                                       │
│                 │                                       │
└─────────────────┘                                       │
                                                          │
┌─────────────────┐     ┌──────────────────┐            │
│                 │     │                  │             │
│ originalDATA.xml│────▶│  Data Ingestion  │─────────────┘
│                 │     │    Pipeline      │
│                 │     │                  │
└─────────────────┘     └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │                  │
                        │  DeepSeek API    │
                        │   (Embeddings)   │
                        │                  │
                        └──────────────────┘
3.3 Environment Variables
PINECONE_API_KEY=<your-pinecone-api-key>
DEEPSEEK_API_KEY=<your-deepseek-api-key>
PINECONE_ENVIRONMENT=<your-pinecone-environment>
PINECONE_INDEX_NAME=<your-pinecone-index-name>
ADMIN_PASSWORD=<initial-admin-password>
PORT=3001

4. Design System
Use the /SVG/X.svg for our main logo use modern high quality design and good heirarchy.
4.1 Typography
Primary Font

Font Family: Geist (Google Fonts)
Weights:

300 (Light) - Body text, descriptions, secondary content
900 (Black) - Headlines, CTAs, emphasis


Font Import:

css@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;900&display=swap');
Typography Scale
css/* Headlines */
.h1 { font-family: 'Geist', sans-serif; font-weight: 900; font-size: 3.5rem; line-height: 1.1; }
.h2 { font-family: 'Geist', sans-serif; font-weight: 900; font-size: 2.5rem; line-height: 1.2; }
.h3 { font-family: 'Geist', sans-serif; font-weight: 900; font-size: 2rem; line-height: 1.3; }
.h4 { font-family: 'Geist', sans-serif; font-weight: 900; font-size: 1.5rem; line-height: 1.4; }

/* Body Text */
.body-large { font-family: 'Geist', sans-serif; font-weight: 300; font-size: 1.125rem; line-height: 1.6; }
.body-regular { font-family: 'Geist', sans-serif; font-weight: 300; font-size: 1rem; line-height: 1.6; }
.body-small { font-family: 'Geist', sans-serif; font-weight: 300; font-size: 0.875rem; line-height: 1.5; }

/* UI Elements */
.button-text { font-family: 'Geist', sans-serif; font-weight: 900; font-size: 0.875rem; letter-spacing: 0.025em; }
.label { font-family: 'Geist', sans-serif; font-weight: 900; font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; }
4.2 Color Palette
Primary Colors
css:root {
  /* Core Black & Charcoal */
  --black-pure: #000000;
  --black-90: #0A0A0A;
  --black-80: #141414;
  --charcoal-dark: #1C1C1C;
  --charcoal: #2A2A2A;
  --charcoal-light: #383838;
  --charcoal-lighter: #464646;
  
  /* Lime Green Accent */
  --lime-primary: #84CC16;      /* Primary lime green */
  --lime-bright: #A3E635;       /* Brighter variation */
  --lime-light: #BEF264;        /* Light lime */
  --lime-dark: #65A30D;         /* Darker lime */
  --lime-muted: #4D7C0F;        /* Muted/subdued lime */
  
  /* Tonal Variations */
  --gray-900: #111111;
  --gray-800: #1F1F1F;
  --gray-700: #2E2E2E;
  --gray-600: #404040;
  --gray-500: #525252;
  --gray-400: #666666;
  --gray-300: #808080;
  --gray-200: #999999;
  --gray-100: #B3B3B3;
  --gray-50: #E6E6E6;
  
  /* Semantic Colors */
  --background-primary: var(--black-90);
  --background-secondary: var(--charcoal-dark);
  --background-tertiary: var(--charcoal);
  --text-primary: #FFFFFF;
  --text-secondary: #B3B3B3;
  --text-muted: #808080;
  --accent: var(--lime-primary);
  --accent-hover: var(--lime-bright);
  --border-default: var(--charcoal-light);
  --border-focus: var(--lime-primary);
}
Light Mode Support (Optional)
css[data-theme="light"] {
  --background-primary: #FFFFFF;
  --background-secondary: #F5F5F5;
  --background-tertiary: #EBEBEB;
  --text-primary: var(--black-pure);
  --text-secondary: var(--gray-600);
  --text-muted: var(--gray-500);
  --border-default: var(--gray-200);
}
4.3 Component Styling Guidelines
Chat Interface
css/* Message Bubbles */
.user-message {
  background: var(--charcoal);
  color: var(--text-primary);
  border-left: 3px solid var(--lime-primary);
}

.ai-response {
  background: var(--charcoal-dark);
  color: var(--text-primary);
  border-left: 3px solid var(--gray-600);
}

/* Input Field */
.chat-input {
  background: var(--black-90);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  font-family: 'Geist', sans-serif;
  font-weight: 300;
}

.chat-input:focus {
  border-color: var(--lime-primary);
  box-shadow: 0 0 0 3px rgba(132, 204, 22, 0.1);
}

/* Send Button */
.send-button {
  background: var(--lime-primary);
  color: var(--black-pure);
  font-weight: 900;
  transition: all 0.2s ease;
}

.send-button:hover {
  background: var(--lime-bright);
  transform: translateY(-1px);
}

.send-button:active {
  background: var(--lime-dark);
  transform: translateY(0);
}
Admin Panel
css/* Navigation */
.admin-nav {
  background: linear-gradient(180deg, var(--black-pure) 0%, var(--charcoal-dark) 100%);
  border-bottom: 1px solid var(--lime-primary);
}

/* Cards */
.admin-card {
  background: var(--charcoal-dark);
  border: 1px solid var(--charcoal-light);
  transition: all 0.3s ease;
}

.admin-card:hover {
  border-color: var(--lime-primary);
  box-shadow: 0 4px 20px rgba(132, 204, 22, 0.15);
}

/* Forms */
.form-input {
  background: var(--black-90);
  border: 1px solid var(--charcoal-lighter);
  color: var(--text-primary);
  font-family: 'Geist', sans-serif;
  font-weight: 300;
}

.form-label {
  color: var(--text-secondary);
  font-weight: 900;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* Data Tables */
.data-table {
  background: var(--charcoal-dark);
}

.data-table-header {
  background: var(--black-90);
  border-bottom: 2px solid var(--lime-primary);
  font-weight: 900;
}

.data-table-row:hover {
  background: var(--charcoal);
}
4.4 Interactive States
Buttons
css/* Primary Button */
.btn-primary {
  background: var(--lime-primary);
  color: var(--black-pure);
  font-weight: 900;
  padding: 12px 24px;
  border: none;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: var(--lime-bright);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(132, 204, 22, 0.3);
}

.btn-primary:active {
  background: var(--lime-dark);
  transform: translateY(0);
}

.btn-primary:disabled {
  background: var(--gray-600);
  cursor: not-allowed;
  opacity: 0.5;
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: var(--lime-primary);
  border: 2px solid var(--lime-primary);
  font-weight: 900;
  padding: 10px 22px;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: var(--lime-primary);
  color: var(--black-pure);
}

/* Ghost Button */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--charcoal-lighter);
  font-weight: 300;
  transition: all 0.2s ease;
}

.btn-ghost:hover {
  border-color: var(--lime-primary);
  color: var(--lime-primary);
}
4.5 Animations & Transitions
css/* Standard Transitions */
.transition-default { transition: all 0.2s ease; }
.transition-slow { transition: all 0.4s ease; }
.transition-fast { transition: all 0.1s ease; }

/* Loading Animation */
@keyframes pulse-lime {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading-indicator {
  animation: pulse-lime 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  color: var(--lime-primary);
}

/* Fade In Animation */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-in {
  animation: fadeIn 0.3s ease forwards;
}
4.6 Spacing & Layout
css:root {
  /* Spacing Scale */
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 1rem;      /* 16px */
  --space-lg: 1.5rem;    /* 24px */
  --space-xl: 2rem;      /* 32px */
  --space-2xl: 3rem;     /* 48px */
  --space-3xl: 4rem;     /* 64px */
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* Container Widths */
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
}
4.7 Accessibility Considerations
Focus States
css/* Keyboard Navigation Focus */
*:focus-visible {
  outline: 2px solid var(--lime-primary);
  outline-offset: 2px;
}

/* High Contrast Mode */
@media (prefers-contrast: high) {
  :root {
    --lime-primary: #B4FF00;
    --text-primary: #FFFFFF;
    --background-primary: #000000;
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
4.8 Implementation in Tailwind CSS
javascript// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        'geist': ['Geist', 'sans-serif'],
      },
      fontWeight: {
        'light': 300,
        'black': 900,
      },
      colors: {
        'black': {
          'pure': '#000000',
          '90': '#0A0A0A',
          '80': '#141414',
        },
        'charcoal': {
          'dark': '#1C1C1C',
          DEFAULT: '#2A2A2A',
          'light': '#383838',
          'lighter': '#464646',
        },
        'lime': {
          'primary': '#84CC16',
          'bright': '#A3E635',
          'light': '#BEF264',
          'dark': '#65A30D',
          'muted': '#4D7C0F',
        }
      }
    }
  }
}

5. Feature Requirements
5.1 Data Ingestion Pipeline
Requirements

Parse originalDATA.xml file
Extract and structure marketing content
Generate embeddings using DeepSeek API
Store vectors in Pinecone with metadata

XML Structure (Expected)
xml<knowledge_base>
  <entry id="unique-id">
    <title>Marketing Strategy Title</title>
    <content>Full text content...</content>
    <category>Strategy/Tactics/Case Study</category>
    <tags>tag1,tag2,tag3</tags>
    <date>2025-01-01</date>
    <author>Author Name</author>
  </entry>
</knowledge_base>
Implementation Details

Batch processing for large datasets
Error handling and retry logic
Progress tracking and logging
Deduplication mechanism
Metadata preservation (category, tags, date, author)

5.2 Chat Interface
User Interface Requirements

Clean, modern chat interface similar to ChatGPT
Message history within session
Typing indicators
Copy/export functionality for responses
Mobile-responsive design

Functional Requirements

Natural language query processing
Context-aware responses
Source attribution for retrieved information
Relevance scoring display
Query suggestions/autocomplete
Session management

API Endpoints
POST /api/chat
  Body: { query: string, sessionId?: string }
  Response: { answer: string, sources: array, relevance: number }

GET /api/chat/history/:sessionId
  Response: { messages: array }

POST /api/chat/feedback
  Body: { messageId: string, rating: number, comment?: string }
5.3 Admin Panel
Authentication

Secure login system
Role-based access control (future enhancement)
Session timeout after inactivity
Password reset capability

Content Management Features

Add New Content

Form-based input for new knowledge entries
Rich text editor for content
Category and tag management
Preview before submission
Bulk upload via CSV/JSON


Update Existing Content

Search and filter existing entries
Edit metadata and content
Version history tracking
Batch operations


Delete Content

Soft delete with recovery option
Bulk deletion with confirmation
Audit trail


Analytics Dashboard

Query volume metrics
Popular topics/searches
User engagement statistics
System performance metrics



API Endpoints
POST /api/admin/login
  Body: { username: string, password: string }
  Response: { token: string, expiresIn: number }

POST /api/admin/content
  Headers: { Authorization: Bearer <token> }
  Body: { title: string, content: string, category: string, tags: array }
  Response: { id: string, status: string }

PUT /api/admin/content/:id
  Headers: { Authorization: Bearer <token> }
  Body: { title?: string, content?: string, category?: string, tags?: array }
  Response: { id: string, status: string }

DELETE /api/admin/content/:id
  Headers: { Authorization: Bearer <token> }
  Response: { status: string }

GET /api/admin/content
  Headers: { Authorization: Bearer <token> }
  Query: { page: number, limit: number, search?: string }
  Response: { items: array, total: number, page: number }

GET /api/admin/analytics
  Headers: { Authorization: Bearer <token> }
  Response: { metrics: object }

6. Data Models
6.1 Vector Database Schema (Pinecone)
javascript{
  id: "unique-vector-id",
  values: [0.1, 0.2, ...], // 1536-dimensional vector from DeepSeek
  metadata: {
    title: "Marketing Strategy Title",
    content: "Full text content (truncated for display)",
    category: "Strategy",
    tags: ["digital", "social-media", "campaigns"],
    author: "John Doe",
    dateCreated: "2025-01-01T00:00:00Z",
    dateModified: "2025-01-15T00:00:00Z",
    source: "originalDATA.xml",
    version: 1
  }
}
6.2 Database Schema (Optional - for session/user management)
sql-- Sessions Table
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP,
  user_identifier VARCHAR(255)
);

-- Messages Table
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  sources JSON,
  relevance_score FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin Users Table
CREATE TABLE admin_users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Audit Log Table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  admin_user_id UUID REFERENCES admin_users(id),
  action VARCHAR(50),
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

7. Implementation Phases
Phase 1: Foundation (Week 1-2)

 Project setup and environment configuration
 Implement XML parser for originalDATA.xml
 Integrate DeepSeek API for embeddings
 Set up Pinecone index and connection
 Create data ingestion pipeline
 Basic error handling and logging

Phase 2: Core Chat Interface (Week 3-4)

 Develop backend API structure
 Implement query endpoint with vector search
 Create React frontend with chat UI
 Add session management
 Implement response formatting
 Add source attribution

Phase 3: Admin Panel (Week 5-6)

 Build authentication system
 Create admin dashboard layout
 Implement CRUD operations for content
 Add form validation and error handling
 Create bulk upload functionality
 Implement search and filter features

Phase 4: Enhancement & Polish (Week 7-8)

 Add analytics dashboard
 Implement caching layer
 Optimize query performance
 Add comprehensive error handling
 Create user documentation
 Implement feedback system

Phase 5: Testing & Deployment (Week 9-10)

 Unit testing for all components
 Integration testing
 Performance testing
 Security audit
 Deployment setup
 Production monitoring setup


8. Security Considerations
8.1 Authentication & Authorization

JWT-based authentication for admin panel
Rate limiting on all API endpoints
CORS configuration for production
Input sanitization and validation

8.2 Data Security

Encryption of sensitive data at rest
HTTPS for all communications
API key rotation schedule
Regular security audits

8.3 Privacy

No storage of personal user data in chat interface
Anonymous usage analytics only
GDPR compliance considerations
Data retention policies


9. Performance Requirements
9.1 Response Times

Chat query response: < 2 seconds
Admin panel operations: < 1 second
Data ingestion: < 10 minutes for 10,000 entries

9.2 Scalability

Support 100+ concurrent users
Handle 1000+ queries per hour
Store 100,000+ vector embeddings

9.3 Reliability

99.9% uptime SLA
Automated backup systems
Disaster recovery plan
Graceful degradation


10. Testing Strategy
10.1 Unit Tests

Component-level testing for all functions
Mock external API calls
Test coverage > 80%

10.2 Integration Tests

End-to-end workflow testing
API endpoint testing
Database integration testing

10.3 User Acceptance Testing

Chat interface usability testing
Admin panel functionality testing
Performance benchmarking


11. Monitoring & Maintenance
11.1 Monitoring

Application performance monitoring (APM)
Error tracking (Sentry or similar)
Usage analytics
Vector database metrics

11.2 Maintenance

Regular dependency updates
Vector index optimization
Database cleanup routines
Documentation updates


12. Future Enhancements
Potential Features

Multi-language support
Voice input/output
Advanced analytics and insights
Integration with external marketing tools
Automated content suggestions
Fine-tuned language model for responses
Collaborative features for team usage
Export functionality for reports
Mobile applications


13. Appendix
A. Sample Code Structure
genex-marketing-garden/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── chat.js
│   │   │   └── admin.js
│   │   ├── services/
│   │   │   ├── pinecone.js
│   │   │   ├── deepseek.js
│   │   │   └── ingestion.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── rateLimit.js
│   │   ├── utils/
│   │   │   ├── xmlParser.js
│   │   │   └── logger.js
│   │   └── index.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat/
│   │   │   └── Admin/
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── App.js
│   └── package.json
├── data/
│   └── originalDATA.xml
├── scripts/
│   └── ingest-data.js
└── README.md
B. API Response Formats
Successful Response
json{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
Error Response
json{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}