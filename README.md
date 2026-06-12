# AI Assisted Will Maker

An AI-guided Last Will & Testament drafting application built with NestJS, Next.js, PostgreSQL, and OpenAI.

## Tech Stack
- Backend: NestJS (TypeScript)
- Frontend: Next.js 14 (Tailwind CSS)
- Database: PostgreSQL (Raw pg pool connection)
- Authentication: JWT + bcryptjs

## Prerequisites
- Node.js (v18+)
- PostgreSQL (v16+)
- WSL 2 (Ubuntu) for Windows users (recommended for database connectivity)

## Setup and Installation

### 1. Database Setup (Inside WSL)
Start the PostgreSQL database service and configure credentials:
```bash
bash setup_db.sh
```
This script starts postgres, configures TCP credentials, and creates the `will_maker` database.

### 2. Run NestJS Backend (Inside WSL)
Navigate to the root directory inside WSL and start the backend:
```bash
bash start_backend_wsl.sh
```
This installs dependencies and starts the server on `http://localhost:3001`. On initial run, database tables are auto-created and seeded.

### 3. Run Next.js Frontend (On Windows)
Navigate to the `frontend/` directory and run:
```bash
cd frontend
npm install
npm run dev
```
This starts the frontend on `http://localhost:3000`.

## Demo Credentials
A demo user is seeded automatically for logging in:
- Email: demo@test.com
- Password: 123456

## Scope & Implementation Disclosures
- **Authentication**: Fully implemented via Passport JWT and bcryptjs.
- **Database Schema**: Structured relations for users, wills, assets, beneficiaries, witnesses, and chat messages.
- **AI Interview Engine**: OpenAI gpt-4o-mini conducts step-by-step interviews using JSON Mode. It falls back to a rule-based simulator if no OPENAI_API_KEY is configured in backend/.env.
- **Will Validation**: Warns if a witness is also a beneficiary or if an executor nominee is missing.
- **PDF Export**: Generates and downloads PDFs directly on the client side using html2pdf.js via a CDN script, avoiding print window popups.
- **Known Limitations**: Conversational resets require registering a new user session or clearing messages manually.
