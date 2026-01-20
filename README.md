# ResqueNet - Disaster Response PWA

A secure, offline-first Disaster Response Progressive Web App built with the MERN stack.

## Features
- **Security**: Helmet.js, Rate Limiting, NoSQL Sanitization, JWT in HttpOnly cookies, Bcrypt.
- **Offline First**: Service Worker caching, IndexedDB for local storage when offline.
- **Auto-Sync**: Background Sync API automatically pushes reports when internet returns.
- **GPS Integration**: One-tap location fetching for emergency reports.
- **Role-Based Access**: Citizens report incidents, Admins view all fleet-wide reports.

## Tech Stack
- **Frontend**: React, Tailwind CSS, Lucide React, Axios, idb.
- **Backend**: Node.js, Express, MongoDB, Mongoose.
- **PWA**: Service Worker, manifest.json, Background Sync.

## Getting Started

### Prerequisites
- MongoDB installed and running locally.
- Node.js and npm installed.

### Installation

1. **Clone/Download** the repository.
2. **Setup Server**:
   ```bash
   cd server
   npm install
   # Create .env file with your MongoDB URI and JWT Secret
   npm start
   ```
3. **Setup Client**:
   ```bash
   cd client
   npm install
   npm run dev
   ```

### Usage
- Register as a **Citizen** to report emergencies.
- Register as an **Admin** to see the emergency dashboard.
- To test **Offline Sync**:
  1. Open DevTools > Network > Toggle 'Offline'.
  2. Submit a report (it will save locally).
  3. Toggle 'Online'.
  4. Watch the Background Sync push the report to the database!

## Deliverables
- `/client`: React source code + PWA assets.
- `/server`: Node/Express source code.
- `client/public/sw.js`: Service Worker script.
- `client/public/manifest.json`: PWA Manifest.
