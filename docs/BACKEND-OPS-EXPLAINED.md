# How the backend is deployed, explained

A walkthrough of everything we set up to get the backend running at **https://tradiqo.duckdns.org**: what each piece is, why it exists, and how to operate it. It is written for a developer who knows code but has never deployed a backend. The click-by-click reference is [DEPLOYMENT-backend.md](DEPLOYMENT-backend.md); this document explains the *why*.

---

## 1. The big picture

```
 Your browser / the Angular app
        │  HTTPS request + Firebase ID token (Authorization: Bearer …)
        ▼
 tradiqo.duckdns.org  ── DNS (DuckDNS) resolves the name to ──► 130.61.9.108
        │
        ▼
 Oracle Cloud VM (a Linux computer in Frankfurt, always on)
   └─ Docker Compose runs 3 containers:
        ├─ caddy    listens on ports 80/443, handles HTTPS, forwards /api/* to the app
        ├─ app      the Spring Boot backend (port 8080, not exposed to the internet directly)
        └─ duckdns  every 5 min tells DuckDNS the VM's current IP
        │
        ├──► Firebase (Google): Auth checks tokens, Firestore is the database
        ├──► Finnhub / Twelve Data / FMP / Yahoo: market data
        └──► Gmail SMTP: sends the daily email
```

The frontend-developer analogy: in development, `ng serve` gives you `localhost:4200`. In production, something has to serve your app on a real address, over HTTPS, 24/7, even when your laptop is off. For a backend that "something" is a server, and everything we did was about getting one running, reachable and self-updating.

---

## 2. Vocabulary, mapped to things you know

| Term | What it is | Frontend analogy |
|---|---|---|
| **VM (virtual machine)** | A Linux computer rented from a cloud provider (here Oracle, for free). You log in to it remotely. | A remote laptop that is never turned off. |
| **SSH** | Encrypted remote terminal. `ssh ubuntu@130.61.9.108` opens a shell on the VM. | Like opening a terminal, but on another machine. |
| **SSH key pair** | Login by cryptographic key instead of password. The **private** key stays on your PC; the **public** key is placed on the server. | Like a certificate + private key for HTTPS. |
| **Docker image** | A packaged, runnable snapshot of an app with its runtime (Java + our jar). Built once, runs anywhere. | Like the `dist/` folder of an `ng build`, but including the runtime. |
| **Container** | A running instance of an image. | A running `node server.js` process, isolated. |
| **Docker Compose** | A YAML file (`deploy/docker-compose.yml`) describing several containers and how they connect; `docker compose up -d` starts them all. | Like a `package.json` script that starts several processes together. |
| **Container registry (GHCR)** | Where images are stored so servers can download them: `ghcr.io/iducanhle/earnings-tracker-backend`. | Like the npm registry, but for images. |
| **Reverse proxy (Caddy)** | Sits in front of the app, terminates HTTPS, forwards requests. | Like the Angular dev-server proxy (`proxy.conf.json`), in production. |
| **TLS certificate / Let's Encrypt** | What makes `https://` work. Caddy gets a free one from Let's Encrypt automatically and renews it. | The padlock in the browser. |
| **DNS / DuckDNS** | Maps a name (`tradiqo.duckdns.org`) to an IP address. DuckDNS gives free subdomains. | Like a phone book for servers. |
| **Firewall** | Rules deciding which network ports accept connections. We needed ports 80 (HTTP) and 443 (HTTPS) open. | Like CORS, but at the network level and for everything. |
| **Environment variables / `.env`** | Configuration and secrets passed to the app at startup (API keys, passwords), never in the code. | Like `environment.prod.ts`, except secret and outside git. |
| **CI/CD (GitHub Actions)** | Automation that runs on every push: test, build, deploy. Defined in `.github/workflows/backend.yml`. | Like a Netlify/Vercel build hook, but defined by us. |

---

## 3. What we did, in order, and why

### Step 1: Firebase project `tradiqo` (the database and login system)
- **Firestore** (location `eur3`, Europe) is the database. The backend stores its cache there (stock profiles, prices, earnings, calendar) and reads your follows and settings, which the frontend writes.
- **Authentication** with Google and Email/Password sign-in. The frontend logs users in; the backend only verifies the token the frontend sends.
- **Service-account key** (`firebase-sa.json`): the backend's admin credential for Firebase. It gives full access to the project, so it never goes into git. We generated it twice by accident; the extra key (`18cf64a9…`) should be revoked in the Google Cloud console.
- It stays on the free **Spark** plan: going over the free quota makes requests fail for the day instead of costing money.

### Step 2: API keys (market data)
Finnhub, Twelve Data and FMP keys, all free tiers. They were already in your local `backend/.env`; I copied them into the server configuration.

### Step 3: Gmail app password (the daily email)
A 16-character password that only allows sending mail. Your real Google password is never used, and it can be revoked any time at myaccount.google.com/apppasswords.

### Step 4: Oracle Cloud account and the VM
- **Home region Frankfurt**: Oracle's free resources exist only in the home region, and it can never be changed.
- **Pay As You Go upgrade**: sounds like paying, but the free ("Always Free") resources stay free. Oracle deletes *idle* free VMs on free-tier accounts; PAYG accounts are exempt. Our backend idles most of the day, so this matters.
- **$1 budget alert**: an email as soon as anything costs a cent.
- **The VM**: Ampere A1 (ARM processor), 1 OCPU / 6 GB, Ubuntu 24.04. We wanted 2 OCPU / 12 GB, but Frankfurt had no free capacity ("Out of host capacity" is very common). 1/6 is plenty for two users and can be resized later.
- **Public IP**: Oracle's form couldn't assign one while creating the network at the same time, so we added an "ephemeral public IP" afterwards: **130.61.9.108**.

### Step 5: Two firewalls
Traffic passes two firewalls, and both had to allow ports 80 and 443:
1. **Oracle's Security List**, the cloud firewall around the network. You added two ingress rules in the console.
2. **iptables inside Ubuntu**. Oracle's image blocks everything except SSH. I added the rule over SSH and saved it so it survives reboots.

We tested it by starting a tiny test server on port 80 and calling it from outside. It timed out until you added the Security List rules.

### Step 6: DuckDNS (a name for the IP)
HTTPS certificates are issued for names, not IPs, so we needed a domain. DuckDNS gave `tradiqo.duckdns.org` for free. The `duckdns` container keeps the name pointed at the VM if the IP ever changes.

### Step 7: Setting up the server
Over SSH, I:
- updated Ubuntu and installed **Docker** and **Docker Compose**
- created `/opt/earnings-tracker/` with four files:
  - `docker-compose.yml` and `Caddyfile`, which come from the repo (`deploy/`)
  - `.env`, the configuration and secrets, readable only by the server user
  - `firebase-sa.json`, the Firebase key, also readable only by the server user

The secrets were prepared on your PC in `C:\Users\iduca\earnings-tracker-deploy\`, deliberately outside the git repository so they can never be committed, and copied to the server over SSH.

### Step 8: Building the image on GitHub
Pushing to GitHub triggered the workflow, which ran the tests, built the Docker image for ARM, and pushed it to GHCR. The **package** has its own visibility setting separate from the repo, so it had to be made **public** too. Otherwise the server can't download it without a login, and private packages have small free limits.

### Step 9: First start, and the bug we hit
`docker compose up -d` started the three containers, but the app kept restarting: *"the key file … is not readable"*.

The cause: the image runs the app as user ID **1000** for security (not as root). The key file is readable only by its owner, and on Oracle's Ubuntu image the `ubuntu` user is ID **1001** (1000 belongs to Oracle's `opc` user). The fix: the compose file now runs the app as `APP_USER` (set to `1001:1001` in the server's `.env`). The guide and the code were updated so it can't happen again.

After that: app healthy, Caddy got the certificate, and `https://tradiqo.duckdns.org/api/health` answered `{"status":"UP"}`.

### Step 10: Automatic deploys
So GitHub can update the server by itself:
- a separate SSH key (`earnings_ci`) for GitHub, installed on the server (revocable on its own)
- the server's **host key** stored in GitHub, so GitHub can verify it's really talking to your server (protects against impersonation)
- four **secrets** (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) and the variable `DEPLOY_ENABLED=true`

The first manual run deployed successfully.

---

## 4. How a change reaches production

```
git push (changes in backend/ or deploy/)
   └─► GitHub Actions
        1. Build and test      ./mvnw verify (158 tests). If a test fails, nothing below runs.
        2. Build the image     linux/arm64 image from the tested jar, pushed to GHCR as :latest and :sha-<commit>
        3. Deploy              SSH to the VM → copy docker-compose.yml + Caddyfile →
                               docker compose pull && docker compose up -d → wait until the app is healthy
```

- Downtime per deploy: 10–20 seconds while the app restarts. Caddy returns 502 during that window.
- Pushes that change only `docs/` or the frontend don't trigger it.
- Watch runs at github.com/iducanhle/trading-hub/actions. A red deploy job prints the app's last log lines.
- The server's `.env` and key are never touched by deploys. Changing them is a manual step (section 6).

---

## 5. Where everything lives

| Thing | Location | In git? |
|---|---|---|
| Backend code, tests, Dockerfile | `backend/` | yes |
| Compose file, Caddy config | `deploy/` (copied to the VM on each deploy) | yes |
| CI/CD workflow | `.github/workflows/backend.yml` | yes |
| API contract for the frontend | `docs/CONTRACT.md` | yes |
| Status, decisions, known issues | `docs/PROGRESS-backend.md` | yes |
| Server config + secrets | VM: `/opt/earnings-tracker/.env`; your PC: `C:\Users\iduca\earnings-tracker-deploy\.env` | **no** |
| Firebase admin key | VM: `/opt/earnings-tracker/firebase-sa.json`; your PC: same folder as above | **no** |
| SSH key to the server | your PC: `C:\Users\iduca\.ssh\oracle_ed25519` | **no** |
| GitHub deploy key | your PC: `C:\Users\iduca\.ssh\earnings_ci`; GitHub secret `DEPLOY_SSH_KEY` | **no** |
| Local development config | `backend/.env` (points at the real `tradiqo` project) | **no** |
| Accounts | Oracle, Firebase/Google, DuckDNS, GitHub, Finnhub, Twelve Data, FMP | n/a |

**Back up** the two "no" folders on your PC (`earnings-tracker-deploy` and `.ssh`) in a password manager or on an encrypted USB stick. Everything else can be rebuilt from git or regenerated in the consoles.

---

## 6. Day-to-day operations

Log in: `ssh -i $HOME\.ssh\oracle_ed25519 ubuntu@130.61.9.108`, then `cd /opt/earnings-tracker`.

| I want to… | Command (on the VM) |
|---|---|
| See if everything runs | `docker compose ps` (app should say `healthy`) |
| Read the app log | `docker compose logs -f app` (Ctrl+C stops following, not the app) |
| Restart the app | `docker compose restart app` |
| Change a setting / key | `nano .env`, then `docker compose up -d` (a plain `restart` does not re-read `.env`) |
| Roll back to an older version | add `APP_IMAGE=ghcr.io/iducanhle/earnings-tracker-backend:sha-<commit>` to `.env`, then `docker compose up -d`; remove the line to return to `latest` |
| Run a job now | `POST https://tradiqo.duckdns.org/api/admin/jobs/<name>/run` with a login token (job names: `calendar-refresh`, `eu-universe-refresh`, `prices-refresh`, `earnings-digest`) |
| See when jobs last ran | Firebase console → Firestore → collection `jobRuns` |
| Update Ubuntu (monthly) | `sudo apt update && sudo apt -y upgrade` (reboot if it asks; containers restart by themselves) |

Scheduled jobs (Prague time): calendar refresh 06:00, prices 23:30, email digest 12:00, EU refresh Sunday 03:00.

**Costs** should stay at $0. Check Oracle → Billing → Cost analysis, and Firebase → Usage and billing (plan Spark). The $1 budget emails you if anything changes.

---

## 7. When something breaks

1. **Is it up?** Open `https://tradiqo.duckdns.org/api/health`. Expected: `{"status":"UP"}`.
2. **No answer at all:**
   - is the VM running (Oracle console)?
   - does `tradiqo.duckdns.org` still point at it (`nslookup tradiqo.duckdns.org`)?
   - did someone remove a firewall rule?
3. **502 or errors:** SSH in, `docker compose ps`, then `docker compose logs --tail 100 app`. The log usually says what's wrong in one line (a missing key, a wrong setting).
4. **A deploy failed:** open the red job on GitHub. If the tests failed, nothing was deployed and production still runs the old version.
5. **401/403 from the API:** 401 means a missing or expired token (tokens last 1 hour). 403 means the email isn't in `ALLOWED_EMAILS` in the server `.env`, or isn't verified.

The full troubleshooting list is at the end of [DEPLOYMENT-backend.md](DEPLOYMENT-backend.md).

---

## 8. Getting help from an AI later

Everything an assistant needs is in the repo. Start a new session in this folder with:

> Read docs/PROGRESS-backend.md, docs/DEPLOYMENT-backend.md and docs/BACKEND-OPS-EXPLAINED.md, then help me with: …

Claude Code sessions in `E:\repos\trading-hub` also have a saved memory with the server details. For server work the assistant uses the SSH key on this PC, so it works from this computer, or from another one once you copy the key over.
