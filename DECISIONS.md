# Engineering Decisions - AI Assisted Will Maker

This document records the architectural and technology design choices made during the development of the AI Assisted Will Maker platform.

---

## 1. Database Access: Raw `pg` Connection Pool vs. Heavy ORMs (Prisma / TypeORM)

* **Choice**: Standard PostgreSQL connection pooling using the raw `pg` library.
* **Alternatives Considered**:
  - **Prisma ORM**: Modern ORM with auto-generated client and type-safety.
  - **TypeORM**: Traditional NestJS-native active record/data-mapper ORM.
* **Rationale**:
  - **Zero Compilation Overhead**: Prisma and TypeORM require compiling schemas, running database synchronization scripts, and managing migration histories. In a WSL/Windows environment, running migrations across host boundaries adds toolchain complexity.
  - **No CLI Setup**: Raw SQL pools require zero setup files, configuration loaders, or global CLI client generators.
  - **Auto-Initialization**: Database schema (`schema.sql`) and demo credentials seed statements are executed automatically inside the NestJS `DatabaseService` startup hook, guaranteeing that the database is ready on the first run without user intervention.

---

## 2. Hashing Cryptography: Pure JS `bcryptjs` vs. Native C++ Binding `bcrypt`

* **Choice**: Hashing user passwords using the `bcryptjs` package.
* **Alternatives Considered**:
  - **`bcrypt`**: The standard Node.js library which binds to native C++ implementations.
  - **`argon2`**: A more modern, resource-intensive memory-hard hashing algorithm.
* **Rationale**:
  - **Platform Compatibility**: The native `bcrypt` package compiles native binaries during `npm install`. This process requires the local workspace to have active C++ build toolchains (like MSVC on Windows or GCC/build-essential on WSL Ubuntu). If the compiler is missing or out-of-sync, installation fails immediately.
  - **Zero-Dependency Security**: `bcryptjs` is written in pure JavaScript, has zero dependencies, and provides identical cryptographic hashes. It runs securely and consistently on both Windows and WSL native filesystems without build failures.

---

## 3. Runtime Strategy: WSL native execution vs. Windows Host execution

* **Choice**: Running the database and NestJS backend natively inside the WSL Ubuntu filesystem (`~/will-maker-backend`) while executing Next.js on the Windows host.
* **Alternatives Considered**:
  - **Direct Windows Hosting**: Running PostgreSQL and NestJS directly on the Windows host.
  - **Shared Windows Mounts (`/mnt/c`)**: Keeping files on the Windows filesystem and running them directly via WSL mounts.
* **Rationale**:
  - **Virtual Network Isolation**: Windows 11 Hyper-V / WSL VM firewalls restrict host loopback port mapping by default, causing TCP connection refusals (`ECONNREFUSED`) when Windows applications attempt to reach PostgreSQL inside WSL.
  - **Bypassing Firewalls**: Running the NestJS backend inside the same WSL loopback network as PostgreSQL solves connection blockages, while WSL's auto-forwarding exposes the NestJS API port (`3001`) natively to the Windows browser.
  - **Optimal Node File Watcher Performance**: Executing node servers on WSL shared folders (`/mnt/c/...`) results in extremely high CPU usage and slow hot-reloading due to translation latency between NTFS and Ext4 filesystems. Storing files in the WSL home directory (`~/`) eliminates filesystem translation delays.

---

## 4. AI State Synchronization: Single-Request JSON mode vs. Pipeline Orchestration

* **Choice**: Configuring OpenAI API (`gpt-4o-mini`) in JSON Mode (`response_format: { type: "json_object" }`) to respond with a single structured payload containing both conversational text (`reply`) and extracted fields (`extractedData`).
* **Alternatives Considered**:
  - **Multi-Model Pipeline**: One model call generates the chat response, and a separate, secondary extraction model parses the conversation history to compile data fields.
  - **Entity Extraction Middleware**: Parsing chat strings with regular expressions or token matches in the NestJS service.
* **Rationale**:
  - **Reduced Latency & Costs**: Combining extraction and reply generation in a single prompt halves the number of external network requests to the OpenAI API, reducing token consumption and user wait time.
  - **Real-Time Preview Updates**: Because every response contains the full list of currently extracted fields, the live preview card on the frontend updates dynamically and seamlessly on every turn of the chat.

---

## 5. Document Generation: Client-Side CDN `html2pdf.js` vs. Backend Puppeteer Rendering

* **Choice**: Dynamically injecting `html2pdf.js` from a CDN on the frontend to compile the printable document DOM into an A4 PDF.
* **Alternatives Considered**:
  - **Backend Puppeteer**: Launching a headless Chromium instance inside the NestJS server to render the HTML document and export it to PDF.
  - **Backend PDFKit**: Programmatically painting lines, margins, and text blocks on a PDF canvas.
* **Rationale**:
  - **Bypassing Heavy OS Dependencies**: Running Puppeteer in a headless WSL Ubuntu environment requires installing Chromium and dozens of GUI library packages (`libxss1`, `libatk1.0-0`, `libx11-xcb1`, etc.) which significantly increases compilation size, server memory overhead, and environment setup fragility.
  - **Single-Click Direct Download**: Operating client-side with a CDN script allows the browser to convert the styling and DOM structure to A4 PDF directly, avoiding empty tabs, download dialog blockages, or print dialog overlays.
