# project-tripper
The Integrated Intelligent Travel Ecosystem

## Google Authentication Setup

Google sign-in is wired into both the client and server.

### 1. Create a Google OAuth client

In Google Cloud Console:

1. Create or open a project.
2. Go to `APIs & Services` -> `OAuth consent screen` and configure it.
3. Go to `APIs & Services` -> `Credentials`.
4. Create credentials -> `OAuth client ID`.
5. Choose `Web application`.

Add these `Authorized JavaScript origins` for local development:

- `http://localhost:5173`
- `http://localhost:5174`
- `http://localhost:5175`

You do not need a redirect URI for the current implementation because the app uses the Google ID token flow from the button component.

### 2. Add the client ID to the app

Set the same client ID in both files:

`server/.env`

```env
GOOGLE_CLIENT_ID=your-real-google-client-id.apps.googleusercontent.com
```

`client/.env`

```env
VITE_GOOGLE_CLIENT_ID=your-real-google-client-id.apps.googleusercontent.com
```

Example templates are available in:

- `server/.env.example`
- `client/.env.example`

### 3. Run the app

Start the server:

```bash
cd server
npm run dev
```

Start the client:

```bash
cd client
npm run dev
```

### 4. What happens now

- Users can still register and login with email/password.
- Users can sign in with Google from the login or register page.
- If a user already exists with the same email, the Google account is linked to that existing Tripper account.
- If an account was created only with Google, password login is blocked for that account and the user is prompted to continue with Google.
