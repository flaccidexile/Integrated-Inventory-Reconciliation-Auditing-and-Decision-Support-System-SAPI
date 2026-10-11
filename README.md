# SAPI — Integrated Inventory Reconciliation, Auditing & Decision Support System

A complete PERN-stack implementation of the **Southwind Automotive Parts Inc. (SAPI)** capstone system, powered by **PostgreSQL (Supabase)**, **Express**, **React (Vite + Tailwind CSS)**, and **Node.js**.

---

## 📌 Table of Contents
1. [Overview](#-overview)
2. [Core Objectives & Modules](#-core-objectives--modules)
3. [User Roles & Permissions](#-user-roles--permissions)
4. [Demo Accounts](#-demo-accounts)
5. [How to Run Locally](#-how-to-run-locally)
6. [User Guide — How to Use the System](#-user-guide--how-to-use-the-system)
7. [System Architecture](#-system-architecture)
8. [Database Setup & Migrations](#-database-setup--migrations)
9. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 📖 Overview

SAPI operates across **8 branches** in the Philippines (Quezon City HQ, Baguio, Nueva Ecija, Laguna, Iloilo, Cebu, Davao, and Cagayan de Oro). This system addresses inventory discrepancies, stagnant capital, and shrinkage by providing:

* **Targeted Daily Audits** instead of disruptive annual full-wall counts.
* **Paper-First Blind Counting** adhering to the strict warehouse no-phone policy.
* **Automated Record Locking** on discrepancy detection to prevent tampering.
* **Inter-Branch Dead-Stock Reallocation** to fulfill shortages without issuing new supplier purchase orders.
* **Granular Discrepancy Analytics** highlighting variance trends and root causes.

---

## 🎯 Core Objectives & Modules

| # | Objective | Description | Module Location |
|---|---|---|---|
| **1** | **Targeted Cycle Counting** | Algorithms rank stock positions by risk (ABC velocity, days since count, unit value) and generate printable **blind count sheets** (deliberately omitting system quantities). | `/cycle-counts` |
| **2** | **Discrepancy Approval Workflow** | When an encoded physical count disagrees with the system figure, the position is automatically locked (`Locked` status) and routed for managerial review. | `/discrepancies` |
| **3** | **Discrepancy Analytics** | Visualizes total shrinkage cost, monthly variance trajectory, branch risk breakdown, and root-cause Pareto charts. | `/analytics` |
| **4** | **Automated Dead-Stock Matchmaker** | Automatically detects stagnant stock (>90 days untouched) in one branch and matches it against shortages or low-stock positions in another branch. | `/matchmaker` |

---

## 👥 User Roles & Permissions

The application enforces a 3-tier Role-Based Access Control (RBAC) model across navigation, API endpoints, and database Row Level Security (RLS):

| Capability | Management | Warehouse Staff | Sales Desk |
|---|:---:|:---:|:---:|
| **Executive Overview Dashboard** | ✓ | ✓ | ✓ |
| **Cross-Branch Stock Availability (8 branches)** | ✓ | ✓ | ✓ |
| **Targeted Cycle Counts & Blind Sheets** | ✓ | ✓ | — |
| **Encode Physical Bin Counts** | ✓ | ✓ | — |
| **Raise Discrepancy Tickets** | ✓ | ✓ | — |
| **Approve / Reject Discrepancy Tickets** | **✓** | — | — |
| **Dead-Stock Matchmaker Recommendations** | ✓ | ✓ | — |
| **Request Stock Transfer** | ✓ | ✓ | ✓ |
| **Advance / Execute Transfers** | ✓ | ✓ | — |
| **Purchase Orders & Deliveries** | ✓ | — | — |
| **Suppliers & System Settings** | ✓ | — | — |
| **Discrepancy Root-Cause Analytics** | ✓ | — | — |

* **Warehouse staff cannot approve their own tickets.** Discrepancies stay locked until an authorized manager approves (with a verified root cause) or rejects the adjustment.

---

## 🔑 Demo Accounts

Use these pre-seeded accounts to sign in. The login screen also features quick one-click **"Use"** buttons.

| Role | Email | Password | Home Branch | Default Landing Page |
|---|---|---|---|---|
| **Management** | `manager@southwind.com.ph` | `Southwind#2026` | Quezon City (`BR-QC`) | `/` (Dashboard) |
| **Warehouse** | `warehouse@southwind.com.ph` | `Southwind#2026` | Quezon City (`BR-QC`) | `/cycle-counts` |
| **Sales** | `sales@southwind.com.ph` | `Southwind#2026` | Quezon City (`BR-QC`) | `/inventory` |

*(All additional branch manager, clerk, and sales accounts across all 8 branches also use the default password: `Southwind#2026`).*

---

## 🚀 How to Run Locally

### Prerequisites
* **Node.js 20+** or **Node.js 22+**
* An active **Supabase** project (configured in `.env`)

### Step 1 — Clone the Repository
```bash
git clone https://github.com/flaccidexile/Integrated-Inventory-Reconciliation-Auditing-and-Decision-Support-System-SAPI.git
cd Integrated-Inventory-Reconciliation-Auditing-and-Decision-Support-System-SAPI
```

### Step 2 — Configure Environment Files
Ensure `.env` exists in the root and in `server/`:

```bash
# Windows PowerShell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env

# Linux / macOS
cp .env.example .env
cp server/.env.example server/.env
```

Ensure both files contain your Supabase credentials (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).

### Step 3 — Install Dependencies
```bash
npm install
npm --prefix server install
```

### Step 4 — Run the Application
Start both the backend API and frontend client in two terminal windows:

**Terminal 1 — Backend Express API (Port 4000):**
```bash
npm run server:dev
```

**Terminal 2 — Frontend Client (Port 8443):**
```bash
npm run dev
```

Then open your browser at **http://localhost:8443**.

---

## 📘 User Guide — How to Use the System

### 1. Cycle Counting & Blind Sheets (`/cycle-counts`)
1. **View Priorities:** Stock positions are ranked with priority tags (`High`, `Medium`, `Low`) based on days since last count, ABC valuation class, and recent transfer activity.
2. **Print Blind Count Sheets:** Click **Print Blind Sheet**. The system renders a printable audit sheet displaying parts and bin locations while **omitting system quantities**.
3. **Encode Physical Counts:** Warehouse clerks input the physical quantity counted from the paper sheet and submit.
   * If the count **matches**, the task status updates to `Reconciled`.
   * If there is a **variance**, the record is automatically locked, and a discrepancy ticket is created.

### 2. Discrepancy Resolution & Record Locking (`/discrepancies`)
1. **Locked Status:** Discrepancy tickets appear in the register with status `Locked`.
2. **Manager Review (Management only):**
   * Click **Review Ticket** on any pending discrepancy.
   * Choose **Approve** (requires assigning a verified root cause, e.g., *Miscount*, *Damaged Goods*, *Supplier Discrepancy*, or *Pilferage*). Approval updates physical inventory.
   * Choose **Reject** (if physical recounted items confirm original system numbers).

### 3. Dead-Stock Matchmaker (`/matchmaker`)
1. **Automated Matching:** The engine scans all 8 branches and detects items sitting idle (>90 days) in Branch A that are running low or out-of-stock in Branch B.
2. **Actioning Recommendations:**
   * **Request Transfer:** Creates an inter-branch transfer request instantly.
   * **Dismiss:** Dismisses suggestions that are unviable.

### 4. Cross-Branch Inventory Inquiry (`/inventory`)
1. Search any SKU or part name to see real-time on-hand stock across all 8 branches.
2. Sales staff can initiate stock transfer requests directly from any item's action menu to fulfill counter orders.

### 5. Analytics & Audit Reporting (`/analytics`)
1. Track net discrepancy value and cost impact over time.
2. Review variance by branch to pinpoint locations needing operational review.
3. Analyze root-cause distributions to guide warehouse policy adjustments.

---

## 🏗️ System Architecture

```text
┌──────────────────────┐        ┌───────────────────────┐        ┌──────────────────┐
│  React Client        │  /api  │  Express API Server   │        │  Supabase        │
│  (Vite, :8443)       │ ─────► │  (Node, :4000)        │ ─────► │  PostgreSQL      │
│                      │        │                       │        │  + Auth + RLS    │
│  supabase-js         │        │  Role verification    │        │                  │
│  (Token & session)   │        │  & token-scoped calls │        │  Audit Triggers  │
└──────────────────────┘        └───────────────────────┘        └──────────────────┘
```

* **Presentation Layer:** React 18, Tailwind CSS, Lucide Icons, Recharts.
* **API Layer:** Express 4 with modular routers, helmet security, and Zod validation.
* **Database Layer:** Supabase PostgreSQL with triggers, generated columns for variance tracking, and Row Level Security.
* **Offline Demo Fallback:** Automatically operates seamlessly with bundled data snapshots if running in isolated environments.

---

## 🗄️ Database Setup & Migrations

To apply the complete database schema, triggers, RLS policies, and seed data:

1. Open your **Supabase Dashboard** ➔ **SQL Editor** ➔ **New Query**.
2. Copy and paste the entire contents of [`supabase/setup-all.sql`](supabase/setup-all.sql).
3. Click **Run**.
4. Run the user provisioning script to link Supabase Auth accounts to the profiles table:
   ```bash
   npm run server:provision
   ```

---

## 🛠️ Troubleshooting & FAQ

#### `Port 8443 is already in use`
Vite is already running in another terminal or process. You can open `http://localhost:8443` directly in your browser. To start on another port:
```bash
PORT=8444 npm run dev
```

#### `Could not reach the API on port 4000`
Make sure the Express backend server is running:
```bash
npm run server:dev
```
Verify the health endpoint by visiting: `http://localhost:4000/api/health`.

#### `The token '&&' is not a valid statement separator` (Windows PowerShell)
Windows PowerShell 5.1 uses `;` instead of `&&`. For example:
```powershell
npm run server:seed; npm run server:setup
```
Alternatively, use the convenience commands provided in the root `package.json`.

---

## 📄 License & Credits
Developed for **Southwind Automotive Parts Inc. (SAPI)** Capstone Project · Quezon City University (BSIS).
