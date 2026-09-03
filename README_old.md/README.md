# LeetPath

A DSA tracker for the combined **Striver + Love Babbar sheet (400 problems)** — with real LeetCode sync, streak tracking, and a GitHub-style activity calendar.

**Live:** https://leetpath-nu.vercel.app/

---

## Features

- **No login wall** — browse the full 400-problem roadmap freely; sign in only to track progress
- **Real LeetCode sync** — connect your account once; solved problems auto-update (no manual checkboxes)
- **Activity calendar + real streaks** — GitHub-style heatmap built from actual solve dates, not a fake counter
- **Streak nudge** — warns you when you're about to break your streak
- **Instant search** — filter by problem name, topic, company, or difficulty
- **Auth** — Google OAuth + email/password (JWT + HttpOnly cookies)

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Vanilla JS, HTML, CSS (single-page, no framework) |
| Backend | Node.js, Express |
| Auth | Passport.js (Google OAuth 2.0), JWT, bcryptjs |
| Data | JSON file (400 problems), user progress in JSON |
| Deployment | Frontend → Vercel, Backend → Render |
| Security | Helmet, CORS (split-origin), express-rate-limit |

---

## Project Structure

```
Leetpath-DSA/
├── index.html          # Main app (problem list, calendar, search)
├── landing.html        # Public landing page
├── auth-success.html   # OAuth callback handler
├── script.js           # Frontend logic
├── style.css           # Styling
├── render.yaml         # Render deployment config
├── Backend/
│   ├── server.js       # Express entry point
│   ├── config/passport.js
│   ├── routes/
│   │   ├── auth.js         # Email/password auth
│   │   ├── google-auth.js  # Google OAuth
│   │   ├── progress.js     # User progress CRUD
│   │   └── leetcode.js     # LeetCode sync endpoint
│   ├── middleware/
│   │   ├── auth.js         # JWT verification
│   │   └── Optionalauth.js # Optional auth for public routes
│   ├── utils/storage.js    # JSON file read/write
│   └── data/
│       ├── problems.json   # 400 problems (Striver + Love Babbar)
│       └── users.json      # User accounts + progress
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- LeetCode account (for sync feature)
- Google Cloud project (for OAuth)

### Local Development

```bash
# Clone
git clone https://github.com/abhisekpadhy2244-dev/Leetpath-DSA.git
cd Leetpath-DSA

# Backend
cd Backend
npm install
cp .env.example .env   # fill in your values
npm run dev            # runs on http://localhost:5000

# Frontend (from root)
# Just open index.html with Live Server, or serve with:
npx serve .
```

### Environment Variables (Backend/.env)

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5500

SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

---

## Deployment

**Frontend (Vercel):**
- Connect repo → Framework: "Other" → Output: root → Deploy

**Backend (Render):**
- Web Service → Build: `npm install` → Start: `npm start`
- Add env vars from `.env` (production values)
- `render.yaml` included for zero-config deploys

**CORS:** Backend allows `FRONTEND_URL` + localhost origins automatically.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Email/password signup |
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/logout` | Clear HttpOnly cookie |
| GET | `/api/auth/me` | Current user (requires auth) |
| GET | `/api/auth/google` | Initiate Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback |
| GET | `/api/progress` | Get user's problem progress |
| PUT | `/api/progress/:id` | Update single problem status |
| POST | `/api/leetcode/sync` | Trigger LeetCode sync |
| GET | `/api/leetcode/status` | Check sync status |

---

## Problem Dataset

400 problems curated from:
- **Striver's SDE Sheet** (~180 problems)
- **Love Babbar's DSA Sheet** (~450 problems, deduplicated)

Each entry includes: `id`, `name`, `url`, `difficulty`, `topics[]`, `companies[]`.

---

## Lessons Learned (Builder Notes)

- **CORS across split deployments** (Vercel + Render) is non-trivial — cookies + credentials + `trust proxy` + `sameSite: 'none'` all must align
- **Streak logic** initially used `localStorage` (fake); rewrote to compute from actual LeetCode `solvedAt` timestamps
- **UI redesign halfway through** — first version was cluttered; stripped to essentials after understanding "clean"
- **Rate limiting + Helmet** early prevents headaches later

---

## Contributing

Issues and PRs welcome. Areas needing help:
- LeetCode GraphQL sync reliability
- Mobile responsive polish
- Test coverage

---
## Liveworking demo.
![Sign-in](<Screenshot 2026-09-03 165451.png>)
![The Dashboard(light&dark)](<Screenshot 2026-09-03 165520.png>)
![The ai analyzer](<Screenshot 2026-09-03 165541.png>) 
![The ai analyzer](<Screenshot 2026-09-03 165532.png>)
![leetcode account sync](<Screenshot 2026-09-03 165713.png>)
![AI mentor(askanything)](<Screenshot 2026-09-03 165613.png>)

## License

MIT — use freely, attribution appreciated.

---

## Connect

- **Live Demo:** https://leetpath-nu.vercel.app/
- **GitHub:** https://github.com/abhisekpadhy2244-dev
- **LinkedIn:** [Abhisek Padhy](https://www.linkedin.com/in/abhisekpadhy2244-dev/)

Built solo while grinding LeetCode. 🚀
