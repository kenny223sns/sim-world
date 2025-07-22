# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Quick Start
```bash
make up                 # Start all services (PostgreSQL, backend, frontend)
make down               # Stop all services
make clean              # Complete cleanup (containers, volumes, networks)
```

### Build Commands
```bash
make build              # Build Docker containers
make no-cache           # Build without cache
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev             # Start development server
npm run build           # Production build
npm run lint            # Run ESLint
npm test                # Run Vitest tests
npm run test:ui         # Run tests with UI
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Debugging
```bash
make log-b              # Backend logs  
make log-f              # Frontend logs
make re-b               # Restart backend
```

## Architecture Overview

### Backend: Domain-Driven Design
The backend follows DDD patterns with bounded contexts in `backend/app/domains/`:

- **Domains**: `satellite`, `device`, `simulation`, `coordinates`, `wireless`, `interference`, `drone_tracking`
- **Layer Structure** (per domain):
  - `models/` - Domain entities and DTOs
  - `interfaces/` - Abstract contracts (Repository pattern)
  - `services/` - Business logic 
  - `adapters/` - Infrastructure implementations
  - `api/` - HTTP endpoints

### Advanced Patterns in Use
- **CQRS**: Satellite domain has separate command/query services with event sourcing
- **Repository Pattern**: All data access through interface abstractions
- **Dependency Injection**: FastAPI `Depends()` throughout
- **Result Pattern**: Functional error handling with `Result<T>` wrapper

### Frontend: React + Three.js
- **Component Hierarchy**: `App` → `Layout` → domain components
- **State Management**: Custom hooks pattern (`useDevices`, `useDroneTracking`, etc.)
- **API Layer**: Centralized in `services/` with domain-specific clients
- **3D Rendering**: Three.js integration for satellite/UAV visualization

### Database Architecture
- **SQLModel**: Async ORM with PostgreSQL + PostGIS
- **Connection Management**: `DatabaseManager` with proper lifecycle
- **Repository Implementation**: Concrete adapters like `SQLModelDeviceRepository`

### Key Integrations
- **Sionna**: GPU-accelerated wireless simulations
- **Skyfield**: Satellite orbital calculations  
- **WebSocket**: Real-time device tracking
- **Three.js**: 3D scene rendering

## Development Guidelines

### Adding New Domains
1. Create domain structure in `backend/app/domains/new_domain/`
2. Implement Repository interface and service
3. Add API router to `api/v1/router.py`
4. Update `domains/context_maps.py` for dependencies

### Adding Frontend Features
1. Create API client in `services/newFeatureApi.ts`
2. Add routes to `config/apiRoutes.ts` 
3. Implement custom hook for state management
4. Build component following existing patterns

### Environment Configuration
- Main config: `.env` and `backend/.env`
- GPU/CPU mode: `CUDA_VISIBLE_DEVICES=-1` for CPU
- Database: PostgreSQL with PostGIS extensions
- Rendering: `PYOPENGL_PLATFORM` for backend rendering mode

### Service URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:8888  
- API Docs: http://localhost:8888/docs
- Database: localhost:5432

### Testing
- Frontend: Vitest with React Testing Library
- Backend: Manual Python tests (no formal framework configured)
- Integration: Docker compose for full stack testing