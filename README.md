# DiagAI — AI Diagram Generator

Turn ChatGPT-style text diagrams into clean, editable flowcharts and architecture diagrams.

## Features

- **Multi-format parsing** — inline arrows (`A -> B`), unicode vertical (`↓`), bullet hierarchy, Mermaid-like syntax
- **Auto node-type detection** — actors, databases, APIs, security modules, observability services
- **Visual editor** — drag/drop nodes, edit labels, change types, reconnect edges
- **Auto layout** — top-to-bottom or left-to-right via Dagre
- **Export** — PNG, SVG, PDF, JSON
- **Undo / Redo** — full history management
- **Save / Load** — JSON-based diagram persistence

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Diagram engine | React Flow v11 |
| Layout | Dagre |
| Export | html-to-image + jsPDF |
| Backend | Node.js + Express + TypeScript |

## Getting Started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

### Backend (optional for MVP)

```bash
cd backend
npm install
npm run dev
```

API available at **http://localhost:4000**

---

## Input Formats

### Vertical arrows (unicode ↓)

```
User
  ↓
Service
  ↓
Database
```

### Inline arrows (`->`)

```
User -> Auth -> Database
```

### Mermaid-like

```
flowchart TD
  A[User] --> B[Service]
  B --> C[Database]
```

### Bullet hierarchy

```
- System
  - Frontend
  - Backend
    - API
    - Database
```

---

## Project Structure

```
DiagAI/
├── frontend/                # React + TypeScript SPA
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── parser/          # Text-to-graph parser
│   │   ├── models/          # Data models (GraphModel, DiagNode, DiagEdge)
│   │   ├── hooks/           # useLayout, useHistory
│   │   └── utils/           # Export utilities (PNG, SVG, PDF)
│   └── ...
├── backend/                 # Express REST API
│   ├── src/
│   │   ├── routes/          # /api/parse, /api/diagrams
│   │   └── services/        # Parser service (server-side validation)
│   └── ...
└── README.md
```

---

## Roadmap

| Phase | Scope |
|---|---|
| **Phase 1 — MVP** | Text parsing, visual editor, PNG/PDF export, save/load JSON |
| **Phase 2** | Templates, SVG/Mermaid export, collaboration via shared links |
| **Phase 3** | Real-time multiplayer, domain-specific validation, enterprise SSO |

---

## Example

**Input:**

```
User
  ↓
User Interface
  ↓
Authentication Module
  ↓
Authorization Module (RBAC)
  ↓
Cryptographic Engine
  ↓
Secure Database
  ↓
Logging & Monitoring System
```

**DiagAI detects:**

- `User` → actor
- `Authentication Module`, `Authorization Module` → security
- `Cryptographic Engine` → security
- `Secure Database` → database
- `Logging & Monitoring System` → observability

And auto-styles each node accordingly, ready to export or share.

