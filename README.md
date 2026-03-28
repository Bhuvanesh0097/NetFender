# 🛡️ NetFender — AI-Powered Phishing Defense Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

**NetFender** is an intelligent phishing defense application that scans emails (via IMAP) and SMS messages (via USB/ADB) for threats using rule-based detection combined with OpenAI-powered AI analysis. It provides a real-time dashboard for monitoring and categorizing threats.

---

## ✨ Key Features

- **📧 Email Scanning** — Connects to any IMAP mailbox and scans emails newest-first for phishing threats
- **📱 SMS Scanning** — Reads SMS from Android phones via USB/ADB, or accepts manual paste/file import
- **🤖 AI Analysis** — OpenAI GPT-powered phishing detection with rule-based pre-screening
- **📊 Dashboard** — Real-time threat statistics with phishing/suspicious/safe categorization
- **🔒 Security First** — Supply-chain attack defenses built into the package manager configuration

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React + Vite + TailwindCSS |
| **Backend** | Express 5 (Node.js 24) |
| **Database** | PostgreSQL + Drizzle ORM |
| **Validation** | Zod v4 + drizzle-zod |
| **AI Engine** | OpenAI GPT Integration |
| **API Codegen** | Orval (from OpenAPI 3.1 spec) |
| **Build Tool** | esbuild (CJS bundle) |
| **Monorepo** | pnpm workspaces |

---

## 📁 Project Structure

```
NetFender/
├── artifacts/
│   ├── phish-hunter/                    # React+Vite frontend (Dashboard UI)
│   ├── api-server/                      # Express 5 API server
│   └── mockup-sandbox/                  # UI mockup sandbox
├── lib/
│   ├── api-spec/                        # OpenAPI spec + Orval codegen
│   ├── api-client-react/                # Generated React Query hooks
│   ├── api-zod/                         # Generated Zod schemas
│   ├── db/                              # Drizzle ORM schema + DB connection
│   └── integrations-openai-ai-server/   # OpenAI client integration
├── scripts/                             # Utility scripts
├── pnpm-workspace.yaml                  # Workspace configuration
├── tsconfig.base.json                   # Shared TypeScript config
└── package.json                         # Root package
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 24+
- **pnpm** (install via `npm install -g pnpm`)
- **PostgreSQL** database
- **OpenAI API Key**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Bhuvanesh0097/NetFender.git
   cd NetFender
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the project root:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/phishing_defense
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **Set up the database**
   ```bash
   pnpm --filter @workspace/db run push
   ```

5. **Run codegen** (generate API client hooks & Zod schemas)
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```

### Running Locally

**Start the frontend (PhishHunter Dashboard):**
```bash
pnpm --filter @workspace/phish-hunter dev
```
The frontend will be available at `http://localhost:5173`

**Start the backend API server:**
```bash
pnpm --filter @workspace/api-server run dev
```

### Build for Production

```bash
pnpm run build
```

---

## 🧪 Development

### TypeScript

All packages use composite TypeScript projects. Always typecheck from the root:
```bash
pnpm run typecheck
```

### API Codegen

When the OpenAPI spec changes, regenerate the client:
```bash
pnpm --filter @workspace/api-spec run codegen
```

### Database Migrations

```bash
# Push schema changes
pnpm --filter @workspace/db run push

# Force push (fallback)
pnpm --filter @workspace/db run push-force
```

---

## 📦 Workspace Packages

| Package | Description |
|---------|-------------|
| `@workspace/phish-hunter` | React+Vite frontend dashboard |
| `@workspace/api-server` | Express 5 API server with IMAP/ADB integration |
| `@workspace/mockup-sandbox` | UI mockup sandbox |
| `@workspace/db` | Drizzle ORM schema & PostgreSQL connection |
| `@workspace/api-spec` | OpenAPI 3.1 spec + Orval codegen config |
| `@workspace/api-client-react` | Generated React Query hooks |
| `@workspace/api-zod` | Generated Zod validation schemas |
| `@workspace/scripts` | Utility scripts |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Bhuvanesh** — [GitHub](https://github.com/Bhuvanesh0097)

---

<p align="center">
  Built with ❤️ to make the internet safer
</p>
