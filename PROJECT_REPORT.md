# ResqueNet: Comprehensive Project Report

## **1. Introduction & Purpose**
**ResqueNet** is a high-performance, full-stack emergency management system designed to bridge the gap between citizens in distress and emergency responders. Its primary purpose is to provide a reliable, rapid-response platform where users can report incidents, request emergency aid (SOS), and track resolution progress in real-time. It is built with an "Offline-First" philosophy to ensure reliability even in areas with poor connectivity.

---

## **2. Technology Stack**
The project utilizes the **MERN (MongoDB, Express, React, Node.js)** stack with advanced security and performance integrations:

*   **Frontend**: 
    *   **React.js (Vite)**: For a fast, responsive Single Page Application (SPA).
    *   **Tailwind CSS**: For premium, modern UI styling with a mobile-first approach.
    *   **Lucide-React**: For high-quality emergency-themed iconography.
    *   **Service Workers & IndexedDB**: For offline data persistence and background sync.
*   **Backend**: 
    *   **Node.js & Express**: Handling API logic and route orchestration.
    *   **MongoDB Atlas**: Cloud database for structured storage of users and incidents.
    *   **JWT & Cookie-Parser**: Secure, stateless authentication via HTTP-only cookies.
    *   **Bcrypt.js**: Industry-standard password hashing.
*   **Security & Protection**:
    *   **Helmet.js**: Sets security-related HTTP headers.
    *   **Express-Rate-Limit**: Prevents brute-force and DDoS attacks.
    *   **Mongo-Sanitize**: Prevents NoSQL Injection attacks.
    *   **DOMPurify**: Sanitizes frontend inputs to prevent XSS.

---

## **3. Application Content & Modules**
*   **Authentication Engine**: Secure login and registration with role-based access control (RBAC). Current roles: `Citizen` and `Admin`.
*   **Emergency Dashboard**:
    *   **Citizen View**: One-tap SOS button, detailed incident reporting (with GPS), and personal history.
    *   **Admin View**: Real-time "Command Center" to monitor all alerts, manage users, and update incident statuses.
*   **Incident Reporting Module**: A smart form that captures titles, categories (Fire, Medical, etc.), GPS coordinates, and detailed descriptions.
*   **Transmission Feed**: A live list of active emergencies with status indicators (Pending, In Progress, Resolved).
*   **Public SOS Bypass**: A unique feature allowing users to send a silent distress signal directly from the login page without needing an account.

---

## **4. Workflow (How It Works)**
1.  **Detection**: A user sees or experiences an emergency.
2.  **Alerting**: The user either sends a Quick SOS or fills a Detailed Report. The system automatically detects their GPS coordinates.
3.  **Persistence**: If offline, the report is saved to the browser's IndexedDB. The Service Worker automatically syncs it when the internet returns.
4.  **Dispatch**: Admins receive the alert in their dashboard.
5.  **Resolution**: The Admin assigns the case a status (e.g., "In Progress"). Once resolved, the status is updated.

---

## **5. Key Applications**
*   **Disaster Management**: Reporting floods, earthquakes, or fires.
*   **Medical Emergencies**: Quick alerts for ambulances.
*   **Public Safety**: Reporting accidents or crimes in progress.
*   **Corporate Safety**: Internal safety reporting for large industrial sites.
