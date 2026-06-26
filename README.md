# Tripper

Tripper is a full-stack group travel management app for planning trips, sharing expenses, tracking balances, coordinating members, and keeping a live activity feed for each trip.

It combines:

- trip creation and join-code based invitations
- email/password authentication and Google sign-in
- shared trip rooms with live updates over Socket.IO
- ledger and balance tracking for group expenses
- itinerary planning with visit tracking
- role-based member management for trip admins
- profile pictures for users

## Overview

The project is split into two apps:

- `client/`: React + Vite frontend
- `server/`: Express + MongoDB backend

Each authenticated user can create trips, invite others via a join code, record expenses, manage itinerary items, and monitor trip activity in real time.

## Core Features

- Authentication
  - register/login with email and password
  - Google sign-in using Google OAuth ID tokens
  - JWT-based protected API access

- Dashboard
  - list active trips
  - separate past trips from active ones
  - create new trips
  - join trips using a 6-character join code
  - upload a profile picture

- Trip Room
  - view trip details, budget, member count, and join code
  - real-time updates using Socket.IO
  - open dedicated panels for itinerary, members, ledger, and activity

- Member Management
  - promote members to admin
  - demote admins
  - kick users from a trip
  - end a trip and lock further changes

- Expenses and Ledger
  - record trip expenses
  - record UPI-based payments
  - compute simplified balances between members
  - show transaction history and balance summaries

- Itinerary
  - add, edit, delete, and mark itinerary items as visited
  - store location points and scheduled times
  - react to budget-related itinerary updates

- Activity Feed
  - log major trip events
  - emit live updates to connected members

## Tech Stack

- Frontend
  - React 19
  - Vite
  - React Router
  - Tailwind CSS
  - Axios
  - Socket.IO Client
  - `@react-oauth/google`

- Backend
  - Node.js
  - Express
  - MongoDB + Mongoose
  - JWT
  - bcryptjs
  - Socket.IO
  - `google-auth-library`

## Project Structure

```text
project-tripper/
|-- client/
|   |-- src/
|   |   |-- api/
|   |   |-- components/
|   |   |-- context/
|   |   `-- pages/
|   `-- package.json
|-- server/
|   |-- src/
|   |   |-- config/
|   |   |-- controllers/
|   |   |-- events/
|   |   |-- middleware/
|   |   |-- models/
|   |   |-- routes/
|   |   `-- services/
|   `-- package.json
`-- README.md
```

## How It Works

### Authentication

- `POST /api/auth/register` creates a normal account
- `POST /api/auth/login` logs in with email/password
- `POST /api/auth/google` verifies a Google ID token on the server
- successful auth returns a JWT and user payload
- the frontend stores both in local storage

### Trips

- creating a trip generates a random uppercase join code
- users join trips with `POST /api/users/join`
- trip admins can manage members and budgets
- ended trips remain viewable but are treated as locked

### Real-Time Updates

The backend exposes a Socket.IO server. Clients join a room for each trip and receive live events such as:

- `budget_updated`
- `trip_members_updated`
- `trip_ended`
- `receive_message`
- `user_kicked`
- `itinerary_updated`

### Ledger Logic

The backend calculates trip balances from recorded expenses and stores simplified balances on the trip document. Ledger summaries are returned through the ledger API and rendered in the trip room.

## Data Model Summary

### User

- `username`
- `email`
- `password`
- `googleId`
- `profilePic`
- `trips`

### Trip

- `title`
- `description`
- `join_code`
- `admin`
- `admins`
- `members`
- `total_budget`
- `balances`
- `status`

### Expense

- `tripId`
- `paidBy`
- `amount`
- `description`
- `category`
- `prevHash`
- `currHash`
- `timestamp`

### ItineraryItem

- `tripId`
- `location_name`
- `location`
- `estimated_cost`
- `priority_score`
- `scheduled_time`
- `visited`
- `isSkipped`
- optional legacy fields such as `day` and `activity`

## Prerequisites

Install these before running the project:

- Node.js 18+ recommended
- npm
- MongoDB running locally, or a MongoDB Atlas URI

## Environment Variables

### Server

Create `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/project-tripper
JWT_SECRET=your_jwt_secret_here
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

`server/.env.example` is included as a template.

### Client

Create `client/.env`:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_API_URL=http://localhost:5000/api
```

`client/.env.example` is included as a template.

## Local Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd project-tripper
```

### 2. Install dependencies

Install backend dependencies:

```bash
cd server
npm install
```

Install frontend dependencies:

```bash
cd ../client
npm install
```

### 3. Configure environment variables

- create `server/.env`
- create `client/.env`
- add the required values shown above

### 4. Start the backend

```bash
cd server
npm run dev
```

### 5. Start the frontend

```bash
cd client
npm run dev
```

### 6. Open the app

Visit:

```text
http://localhost:5173
```

The backend runs on:

```text
http://localhost:5000
```

## Google Authentication Setup

Google sign-in is already integrated in the codebase. To enable it:

1. Open Google Cloud Console.
2. Create or select a project.
3. Configure the OAuth consent screen.
4. Create an `OAuth client ID`.
5. Choose `Web application`.
6. Add these authorized JavaScript origins for local development:
   - `http://localhost:5173`
   - `http://localhost:5174`
   - `http://localhost:5175`
7. Copy the generated client ID.
8. Set the same client ID in:
   - `server/.env` as `GOOGLE_CLIENT_ID`
   - `client/.env` as `VITE_GOOGLE_CLIENT_ID`

Notes:

- this project uses the Google ID token flow
- no redirect URI is required for the current local setup
- if a user already exists with the same email, Google sign-in links to that account
- if an account only has Google auth, password login is rejected for that account

## Available Scripts

### Server

From `server/`:

- `npm run dev`: start the backend with nodemon
- `npm start`: start the backend with Node.js

### Client

From `client/`:

- `npm run dev`: start the Vite dev server
- `npm run build`: create a production build
- `npm run preview`: preview the production build locally
- `npm run lint`: run ESLint

## API Overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`

### Users

- `POST /api/users/join`
- `PATCH /api/users/profile-picture`

### Trips

- `GET /api/trips/my`
- `GET /api/trips/:tripId`
- `POST /api/trips/create`
- `PUT /api/trips/:tripId/promote/:userId`
- `PUT /api/trips/:tripId/demote/:userId`
- `DELETE /api/trips/:tripId/kick/:userId`
- `PUT /api/trips/:tripId/budget`
- `PUT /api/trips/:tripId/end`

### Expenses and Payments

- `POST /api/expenses`
- `POST /api/payments/record-upi`

### Itinerary

- `POST /api/itinerary/:tripId`
- `GET /api/itinerary/:tripId`
- `PUT /api/itinerary/:itemId`
- `PATCH /api/itinerary/:itemId/toggle-visited`
- `DELETE /api/itinerary/:itemId`

### Activity and Ledger

- `GET /api/activities/:tripId`
- `GET /api/ledger/:tripId`

## Deployment Notes

Recommended deployment path:

- MongoDB Atlas for the production database
- Render for the Express + Socket.IO backend
- Vercel for the Vite React frontend

### 1. Prepare MongoDB Atlas

Create an Atlas cluster, add a database user, and allow network access from your host.
For Render, the easiest first deployment setting is `0.0.0.0/0` in Atlas Network Access. For a stricter production setup, replace that later with Render's outbound IPs if your plan supports them.

Copy the Atlas connection string and include the database name:

```env
MONGO_URI=mongodb+srv://username:password@cluster0.example.mongodb.net/project-tripper?retryWrites=true&w=majority
```

### 2. Deploy the backend on Render

Create a new Web Service from this repository.

Use these settings:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
```

Add these Render environment variables:

```env
PORT=10000
MONGO_URI=your_atlas_connection_string
JWT_SECRET=use_a_long_random_secret
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
CLIENT_URL=https://your-vercel-app.vercel.app
```

After Render deploys, copy the backend URL. It will look like:

```text
https://project-tripper-api.onrender.com
```

### 3. Deploy the frontend on Vercel

Create a new Vercel project from this repository.

Use these settings:

```text
Root Directory: client
Build Command: npm run build
Output Directory: dist
```

Add these Vercel environment variables:

```env
VITE_API_URL=https://project-tripper-api.onrender.com/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

The `client/vercel.json` file rewrites all frontend routes to `index.html`, so refreshing pages like `/dashboard` and `/trip/:id` works.

### 4. Update production URLs

After Vercel gives you the final frontend URL, update Render's `CLIENT_URL` to that exact URL and redeploy the backend.

If Google sign-in is enabled, also add the Vercel URL to the OAuth client's authorized JavaScript origins in Google Cloud Console.

## Troubleshooting

### Google sign-in button is disabled

Check that `client/.env` contains:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Then restart the frontend dev server.

### Google login fails on the server

Check that:

- `server/.env` has the correct `GOOGLE_CLIENT_ID`
- the same client ID is used in both client and server env files
- your Google Cloud OAuth app includes the correct local origin

### Profile picture upload fails

Current upload rules:

- image only
- up to about 1 MB on the client
- backend JSON payload limit is set to 2 MB

If it still fails, try a smaller image.

### Backend cannot connect to MongoDB

Check:

- MongoDB is running locally
- `MONGO_URI` is correct
- the selected database is reachable from your machine

## Known Gaps

- no automated test suite is configured yet
- deployment configuration is not fully externalized
- some client lint issues may still exist outside the main auth/profile flow

## Future Improvements

- make API and Socket.IO base URLs configurable
- add automated tests for auth, trips, ledger, and itinerary flows
- add image storage outside MongoDB base64 strings
- add password reset and account recovery
- improve mobile responsiveness and empty states further
- add production deployment configuration for Vercel/Render/Atlas

## License

No license has been specified in the current project files.
