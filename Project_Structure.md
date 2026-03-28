# 📁 Project Structure

This repository follows a monorepo architecture, separating application layers, AI services, and shared resources to ensure scalability, maintainability, and clear responsibility boundaries.

---

## 🏗️ Root Structure

ai-video-knowledge/
│
├── apps/                  
├── services/              
├── packages/              
├── infrastructure/        
├── storage/               
├── scripts/               
│
├── .env
└── README.md

---

## 📦 apps/

apps/
├── web/                   
└── api/                   

---

### 🌐 apps/web/

web/
├── docs/
│   └── design.md          # Intelligent Ether design system (moved from legacy synthetix_ui)
├── src/
│   ├── components/        # Shared UI (e.g. ScreenNav, MaterialIcon)
│   ├── features/          # Feature slices: auth, video-workspace, roadmap, quiz, analytics
│   ├── brand.ts           # Product naming (single source)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css          # Tailwind + Ether utilities (.ether-gradient, .glass-panel, …)
│
├── public/
├── tailwind.config.cjs    # Preset: @ether/design-tokens
├── postcss.config.cjs
└── package.json

---

### ⚙️ apps/api/

api/
├── app/
│   ├── Modules/           
│   │   ├── Video/
│   │   ├── Transcript/
│   │   ├── Knowledge/
│   │   ├── Quiz/
│   │   └── User/
│   │
│   ├── Core/              
│   │   ├── Http/
│   │   ├── Database/
│   │   ├── Queue/
│   │   └── AI/
│
├── routes/
│   └── api.php
│
├── config/
├── storage/
└── public/

---

## 🤖 services/

services/
├── transcription-service/        
├── reasoning-service/            
└── knowledge-graph-service/      

---

## 📚 packages/

packages/
├── design-tokens/         # @ether/design-tokens — Tailwind preset (colors, radii, fonts)
├── shared-types/          # (planned)
├── utils/                 # (planned)
└── config/                # (planned)

---

## 🏗️ infrastructure/

infrastructure/
├── docker/                
├── nginx/                 
└── ci-cd/                

---

## 💾 storage/

storage/
├── videos/                
├── transcripts/           
├── embeddings/            
└── logs/

---

## ⚙️ scripts/

scripts/
├── process-video.sh
├── reindex-embeddings.py
└── cleanup.sh
