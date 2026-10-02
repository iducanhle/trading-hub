# Deploying the backend

This guide takes you from nothing to the backend running at `https://YOURNAME.duckdns.org`, redeployed automatically on every push to `main`. It assumes you have never deployed anything. Every step says what to click or type, what you should see, and what to do when it goes wrong.

**What you end up with**

```
 Browser (frontend on Firebase Hosting)
        │  HTTPS + Firebase ID token
        ▼
 YOURNAME.duckdns.org ──► Oracle Cloud VM (Frankfurt, Always Free, Ubuntu 24.04 arm64)
                            └─ Docker Compose
                                 ├─ caddy    ports 80/443, automatic HTTPS certificate
                                 ├─ app      the Spring Boot API (image from GitHub's container registry)
                                 └─ duckdns  keeps YOURNAME.duckdns.org pointed at the VM
        app ──► Firebase (Auth + Firestore), Finnhub, Twelve Data, FMP, Yahoo, Gmail SMTP
```

**Cost:** $0 per month. Everything stays inside free tiers (section 9 shows how to check).
**Time:** about 2 hours, most of it waiting for accounts and the first build.
**You need:** a Windows, macOS or Linux computer, a Google account, a GitHub account, and a credit or debit card for Oracle's identity check. The card is not charged if you follow this guide.

**Conventions**
- `PC>` marks commands to run on your computer. On Windows use **PowerShell** (Start menu → type "PowerShell"), except in step 7.6 and section 8, which say to use **Git Bash** (installed with Git for Windows). On macOS/Linux use the Terminal, and write `~/.ssh/…` where the commands say `$HOME\.ssh\…`.
- `VM$` marks commands to run on the server, inside the SSH session from section 4.6.
- Replace `YOURNAME` with your DuckDNS subdomain, `VM_IP` with the VM's public IP address, and `PROJECT_ID` with your Firebase project ID.
- The Oracle and Firebase consoles are redesigned from time to time. If a button has moved, use the console's search bar (for example, type "Budgets").

Write each value down as you go (a password manager's secure note works well). Section 6.3 needs them all.

---

## 1. Firebase project

The frontend and the backend share one Firebase project: Authentication for sign-in, Firestore as the database.

### 1.1 Create the project
1. Open <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it, for example, `earnings-tracker`, and click **Continue**.
3. Google Analytics: switch it **off** (not needed), then click **Create project**. Wait about 30 seconds, then click **Continue**.
4. Click the gear icon next to **Project Overview** → **Project settings**. Under **General**, write down the **Project ID** (e.g. `earnings-tracker-1a2b3`). This is `PROJECT_ID`.

**You should see:** the project overview page, and at the bottom left a plan badge that says **Spark** (the free plan).

### 1.2 Create the Firestore database
1. Left menu: **Build → Firestore Database** → **Create database**.
2. If asked for an edition, choose **Standard edition**.
3. Location: **`eur3 (europe-west)`** (multi-region) or **`europe-west3 (Frankfurt)`**. **This cannot be changed later.** Both are free on Spark; Frankfurt is next to the VM.
4. Security rules: choose **Start in production mode**. It denies all client access; the frontend guide replaces the rules. The backend uses the Admin SDK, which is not affected by rules.
5. Click **Create**.

**You should see:** an empty "Data" tab with a "Start collection" button. The backend creates its collections itself.

### 1.3 Turn on sign-in methods
1. Left menu: **Build → Authentication** → **Get started**.
2. Tab **Sign-in method** → **Google** → toggle **Enable**, pick your email as the project support email → **Save**.
3. **Add new provider** → **Email/Password** → toggle the first switch (**Email/Password**) on → **Save**.

**You should see:** both providers listed as **Enabled**.

### 1.4 Create the service-account key (the backend's admin password for Firebase)
1. Gear icon → **Project settings** → tab **Service accounts**.
2. Under **Firebase Admin SDK**, click **Generate new private key** → **Generate key**. A `.json` file downloads.
3. Rename it to **`firebase-sa.json`**.

> **Why this file is dangerous:** it grants full admin access to your Firebase project, including all data and all users. Anyone who has it can read or delete everything.
> - Never commit it to git. The repository's `.gitignore` blocks `firebase-sa.json`, `*-firebase-adminsdk-*.json` and `backend/secrets/`, but don't rely on that alone.
> - Never email it or paste it into chats or issues.
> - It lives in only two places: on the VM (section 6.3, readable only by your user) and, for local development, in `backend/secrets/`.
> - If it ever leaks: Google Cloud console → **IAM & Admin → Service Accounts** → `firebase-adminsdk-…` → **Keys** → delete that key, then generate a new one (section 9.5).

**If "Generate new private key" fails with "Key creation is not allowed on this service account":** your Google account belongs to an organization that blocks keys (common with work or school accounts). Use a personal Google account for this project.

### 1.5 Web API key (needed only for the tests in section 8)
Gear icon → **Project settings** → **General** → **Web API Key**. Write it down. It is not a secret (every Firebase web app ships it to browsers), but keep it with your notes. If the field says there is no key yet, it appears once Authentication is set up (1.3) or after the frontend guide registers a web app.

### 1.6 Stay on the free plan
Do **not** upgrade to Blaze. The backend is designed for Spark's free Firestore quota (50,000 reads and 20,000 writes per day) and measured far below it (section 9.8). On Spark, going over a quota means requests fail for the rest of the day. You are never billed.

---

## 2. Market-data API keys

All free, no card needed. Each key goes into the server's `.env` file (section 6.3).

| Provider | Sign up | Where the key is | `.env` variable | Free limit (the backend stays below it) |
|---|---|---|---|---|
| Finnhub | <https://finnhub.io/register> | Dashboard home: **API Key** | `FINNHUB_API_KEY` | 60 calls/min |
| Twelve Data | <https://twelvedata.com/register> | Dashboard → **API Keys** | `TWELVEDATA_API_KEY` | 8 calls/min, 800/day |
| FMP (optional) | <https://site.financialmodelingprep.com/register> | Dashboard → **API Keys** | `FMP_API_KEY` | 250 calls/day |

Yahoo Finance needs no key. If a key is missing, the backend still starts, logs a warning and falls back to the next provider (usually Yahoo). FMP only adds US revenue data, so you can leave it empty.

---

## 3. Gmail app password (for the digest email)

The backend sends email through Gmail's SMTP server with an **app password**: a 16-character password that only works for sending mail and can be revoked at any time. Your normal Google password is never used. You can use your own Gmail account or a new one created just for this.

1. Open <https://myaccount.google.com/security>. Under "How you sign in to Google", turn on **2-Step Verification** (Gmail requires it for app passwords) and follow the prompts.
2. Open <https://myaccount.google.com/apppasswords>. App name: `Earnings Tracker` → **Create**.
3. Google shows a 16-character password such as `abcd efgh ijkl mnop`, **once**. Write it down without the spaces: `abcdefghijklmnop`.

`.env` values: `MAIL_USERNAME` = that Gmail address, `MAIL_APP_PASSWORD` = the 16 characters.

**If the app passwords page says "The setting you are looking for is not available for your account":** 2-Step Verification is not on yet, your account uses Advanced Protection, or it is a Workspace account whose admin disabled app passwords. Use a personal Gmail account instead.

---

## 4. Oracle Cloud VM

### 4.1 Create the account (home region Frankfurt)
1. Open <https://signup.cloud.oracle.com>. Enter your country, name and email, then verify the email.
2. **Home Region: choose `Germany Central (Frankfurt)`.** Always Free resources exist only in the home region, and **the home region can never be changed**. The backend is designed to run next to the Frankfurt Firestore location.
3. Enter the card for the identity check. Oracle may place a small temporary hold on it; the hold is released.
4. Wait for the "Your account is ready" email (minutes, sometimes a few hours), then sign in at <https://cloud.oracle.com> with your **Cloud Account Name** (tenancy) and email.

### 4.2 Upgrade to Pay As You Go (still $0)
Oracle reclaims **idle** Always Free instances on free-tier accounts: an instance whose CPU use stays under 20% (95th percentile) over 7 days can be stopped and deleted. This backend idles most of the day, so it would be reclaimed. **Pay As You Go (PAYG) accounts are exempt**, and Always Free resources stay free on PAYG. You pay only if you create something that is not Always Free, and the budget alert in 4.3 warns you.

1. Menu **☰ → Billing & Cost Management → Upgrade and Manage Payment**.
2. Choose **Pay As You Go** → **Upgrade your account**, and confirm the payment card.
3. Wait for the "upgrade complete" email (usually under an hour).

**You should see:** the page now says your account is a Pay As You Go account.

### 4.3 Budget alert at $1
1. Menu **☰ → Billing & Cost Management → Budgets** → **Create Budget**.
2. Name: `zero-cost-guard`. Target: **Compartment**, your root compartment (your tenancy name). Schedule: **Monthly**. Budget amount: **1** (USD).
3. Alert rule: threshold metric **Actual spend**, threshold type **Percentage of budget**, value **1** (%), your email as the recipient. This alerts as soon as anything costs a cent.
4. Click **Create**. Optionally add a second rule with metric **Forecast spend** at **100** %.

### 4.4 SSH key for yourself
SSH is how you log in to the VM. The key pair has a **private** half (stays on your computer, never share it) and a **public** half (given to Oracle).

```powershell
PC> ssh-keygen -t ed25519 -f $HOME\.ssh\oracle_ed25519 -C "oracle-vm"
```
Press Enter to accept, and type a passphrase (recommended) or press Enter twice for none.

**You should see:** "Your identification has been saved in …\.ssh\oracle_ed25519" and "Your public key has been saved in …\.ssh\oracle_ed25519.pub".

(macOS/Linux: the same command with `~/.ssh/oracle_ed25519`. If Windows says `ssh-keygen` is not recognized: Settings → System → Optional features → add **OpenSSH Client**.)

### 4.5 Create the VM (Ampere A1, 2 OCPU / 12 GB, Ubuntu 24.04)
1. Menu **☰ → Compute → Instances** → **Create instance**.
2. **Name:** `earnings-tracker`. **Placement:** keep **AD-1** for now.
3. **Image and shape** → **Change shape** → **Virtual machine** → **Ampere** → tick **VM.Standard.A1.Flex** → set **OCPUs = 2** and **Memory = 12 GB** → **Select shape**. The shape shows an **"Always Free-eligible"** label. The Always Free allowance is 4 OCPUs and 24 GB in total, so this uses half.
4. **Change image** → **Ubuntu** → **Canonical Ubuntu 24.04**. Take the regular image, not "Minimal". With an Ampere shape selected, Oracle uses the `aarch64` build (image name ending in `aarch64-…`) → **Select image**.
5. **Networking:** choose **Create new virtual cloud network** and **Create new public subnet** (defaults are fine), and make sure **Automatically assign public IPv4 address** is **on**.
6. **Add SSH keys:** **Upload public key files (.pub)** → choose `oracle_ed25519.pub` from `C:\Users\<you>\.ssh\`. Pick the `.pub` file, never the private one.
7. **Boot volume:** keep the defaults (about 47 GB; Always Free includes 200 GB of block storage).
8. Click **Create**.

**You should see:** the instance page, first orange "Provisioning", then green **Running** after 1–2 minutes. Under **Instance access**, write down the **Public IP address**. This is `VM_IP`.

**"Out of capacity for shape VM.Standard.A1.Flex" / "Out of host capacity":** Frankfurt's free Ampere capacity is sometimes exhausted.
- Change **Placement** to **AD-2** or **AD-3** and click **Create** again.
- Retry later (early morning often works). PAYG accounts (4.2) get capacity more easily.
- As a last resort, create it with 1 OCPU / 6 GB, and later resize it to 2 / 12 (instance page → **More actions → Edit → Edit shape**).

### 4.6 Log in over SSH
```powershell
PC> ssh -i $HOME\.ssh\oracle_ed25519 ubuntu@VM_IP
```
The first time, answer `yes` to "Are you sure you want to continue connecting". The user is always `ubuntu`.

**You should see:** a welcome text and the prompt `ubuntu@earnings-tracker:~$`. Type `exit` to leave.

Troubleshooting:
- **"Connection timed out":** the instance is not Running yet, or you used the private IP (10.x.x.x). Use the public IP.
- **"Permission denied (publickey)":** wrong user (must be `ubuntu`), wrong key file, or the `.pub` file was not added in 4.5.6. To add a key to an existing instance you have to recreate it, so double-check the file name first.
- **"WARNING: UNPROTECTED PRIVATE KEY FILE!" (Windows):** restrict the file to your user:
  ```powershell
  PC> icacls $HOME\.ssh\oracle_ed25519 /inheritance:r /grant:r "$($env:USERNAME):(R)"
  ```

Optional shortcut: create the file `C:\Users\<you>\.ssh\config` with these lines, and from then on `ssh earnings` is enough:
```
Host earnings
    HostName VM_IP
    User ubuntu
    IdentityFile ~/.ssh/oracle_ed25519
```

### 4.7 Open ports 80 and 443 (two firewalls)
Two firewalls sit between the internet and the VM, and **both** must allow HTTP (80) and HTTPS (443). Caddy needs port 80 to obtain the certificate.

**a) Oracle's Security List (the cloud firewall)**
1. Instance page → **Primary VNIC** section → click the **Subnet** link (e.g. `subnet-20260927-…`).
2. Tab or section **Security** → click **Default Security List for vcn-…** → **Security rules** → **Add Ingress Rules**.
3. Rule 1: Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range `80`.
4. **+ Another Ingress Rule** → Rule 2: Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port Range `443`.
5. **Add Ingress Rules**.

**You should see:** the list now has rules for 22 (created by Oracle), 80 and 443.

**b) Ubuntu's iptables (the firewall inside the VM).** Oracle's Ubuntu images reject everything except SSH. Do this **before** installing Docker, so the saved rules contain only your own.
```bash
VM$ sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j ACCEPT
VM$ sudo netfilter-persistent save
VM$ sudo iptables -L INPUT -n --line-numbers | head -n 4
```
**You should see:** line `1` is `ACCEPT tcp -- 0.0.0.0/0 0.0.0.0/0 multiport dports 80,443 ctstate NEW`. The `save` step makes it survive reboots (it writes `/etc/iptables/rules.v4`).

If `netfilter-persistent: command not found`: run `sudo apt install -y iptables-persistent`, answer **Yes** to "Save current IPv4 rules", and run the `save` command again.

---

## 5. DuckDNS (free domain name)

A domain name is needed for the HTTPS certificate. DuckDNS gives you `YOURNAME.duckdns.org` for free.

1. Open <https://www.duckdns.org> and sign in (GitHub, Google, …).
2. In **sub domain**, type a name (e.g. `earnings-yourname`) → **add domain**. This is `YOURNAME`.
3. In the new row, set **current ip** to `VM_IP` → **update ip**.
4. At the top of the page, copy the **token** (a UUID). It is a password for your DuckDNS domains: `.env` only, nowhere else.

Check it from your computer:
```powershell
PC> nslookup YOURNAME.duckdns.org
```
**You should see:** `Address: VM_IP` (it can take a minute).

From now on the `duckdns` container (section 6) re-sends the VM's IP every 5 minutes, so the name keeps working even if Oracle changes the IP.

---

## 6. Server setup

### 6.1 Update Ubuntu and install Docker
Log in (`ssh -i $HOME\.ssh\oracle_ed25519 ubuntu@VM_IP`) and run these commands in order:
```bash
VM$ sudo apt update && sudo apt -y upgrade
VM$ sudo apt install -y ca-certificates curl
VM$ sudo install -m 0755 -d /etc/apt/keyrings
VM$ sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
VM$ sudo chmod a+r /etc/apt/keyrings/docker.asc
VM$ echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
VM$ sudo apt update
VM$ sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
VM$ sudo usermod -aG docker ubuntu
VM$ exit
```
Log in again, because the group change applies only to new sessions. Then:
```bash
VM$ docker run --rm hello-world
VM$ docker compose version
```
**You should see:** "Hello from Docker!" (the image is pulled for `arm64v8`), then `Docker Compose version v2.x`.

If `apt upgrade` shows a purple screen asking which services to restart, press Enter. If it says a reboot is required, run `sudo reboot`, wait a minute and log in again.

### 6.2 Create the app folder
```bash
VM$ sudo mkdir -p /opt/earnings-tracker
VM$ sudo chown ubuntu:ubuntu /opt/earnings-tracker
```

### 6.3 Copy the files and write `.env`
On your computer, in the repository folder (the one containing `backend/` and `deploy/`):
```powershell
PC> scp -i $HOME\.ssh\oracle_ed25519 deploy\docker-compose.yml deploy\Caddyfile backend\.env.example ubuntu@VM_IP:/opt/earnings-tracker/
PC> scp -i $HOME\.ssh\oracle_ed25519 C:\path\to\firebase-sa.json ubuntu@VM_IP:/opt/earnings-tracker/firebase-sa.json
```
**You should see:** one progress line per file, each at 100%.

On the VM:
```bash
VM$ cd /opt/earnings-tracker
VM$ cp .env.example .env
VM$ nano .env
```
Fill in every line (the arrow keys move the cursor; paste with right-click or Ctrl+Shift+V):

| Variable | Value |
|---|---|
| `FINNHUB_API_KEY`, `TWELVEDATA_API_KEY`, `FMP_API_KEY` | from section 2 (`FMP_API_KEY` may stay empty) |
| `FIREBASE_PROJECT_ID` | `PROJECT_ID` from 1.1 |
| `GOOGLE_APPLICATION_CREDENTIALS` | leave as `/run/secrets/firebase-sa.json` (Compose mounts the key there) |
| `ALLOWED_EMAILS` | the two Google/email accounts that may use the app, comma-separated, e.g. `you@gmail.com,friend@gmail.com` |
| `CORS_ALLOWED_ORIGINS` | `https://PROJECT_ID.web.app,https://PROJECT_ID.firebaseapp.com,http://localhost:4200` |
| `MAIL_USERNAME`, `MAIL_APP_PASSWORD` | from section 3 |
| `MAIL_FROM_NAME` | sender name shown in the inbox, e.g. `"Earnings Tracker"` |
| `APP_BASE_URL` | the frontend's address, used for links in emails: `https://PROJECT_ID.web.app` |
| `DOMAIN` | `YOURNAME.duckdns.org` |
| `DUCKDNS_SUBDOMAIN` | `YOURNAME` (without `.duckdns.org`) |
| `DUCKDNS_TOKEN` | from section 5 |
| `TZ` | `Europe/Prague` |
| `APP_USER` | add this line: the output of `echo "$(id -u):$(id -g)"` on the VM, usually `1001:1001` on Oracle's Ubuntu image. The app runs as this user so it can read the key. |

Save with **Ctrl+O**, **Enter**, then exit with **Ctrl+X**. Then lock the two secret files so only your user can read them:
```bash
VM$ chmod 600 .env firebase-sa.json
VM$ rm .env.example
VM$ ls -l
```
**You should see:** `.env` and `firebase-sa.json` with `-rw-------` and owner `ubuntu`, next to `Caddyfile` and `docker-compose.yml`. The app container runs as `APP_USER`, the same user, so it can still read the key.

The stack is started in 7.4, once GitHub has built the image.

---

## 7. CI/CD with GitHub Actions

`.github/workflows/backend.yml` runs on every push to `main` that changes `backend/**`, `deploy/**` or the workflow file (and on demand):

1. **Build and test:** `./mvnw verify` on GitHub's runner (Java 25).
2. **Build and push the arm64 image:** the tested jar is copied into a `linux/arm64` image (buildx, no emulation needed) and pushed to `ghcr.io/<your-github-user>/earnings-tracker-backend` with the tags `latest` and `sha-<commit>`.
3. **Deploy:** copies `deploy/docker-compose.yml` and `deploy/Caddyfile` to the VM over SSH, then runs `docker compose pull && docker compose up -d` and waits until the app reports healthy. This job runs only once you set `DEPLOY_ENABLED` (7.7).

Pull requests only run step 1.

### 7.1 Put the repository on GitHub
If it isn't there yet: <https://github.com/new> → name `trading-hub` → **Create repository** (public or private both work; for private repos see 9.8). Then, in the repository folder:
```powershell
PC> git remote add origin https://github.com/<your-github-user>/trading-hub.git
PC> git push -u origin main
```

### 7.2 First run: build the image
The push starts the workflow. Open the repository → tab **Actions** → **Backend**.

**You should see:** "Build and test" and "Build and push the arm64 image" turn green after about 5 minutes. "Deploy to the VM" is shown as skipped, because `DEPLOY_ENABLED` isn't set yet.

If "Build and test" fails, click it to see which test failed. The test reports are attached to the run as the `test-reports` artifact.

### 7.3 Make the image public
GitHub creates the image package as **private**. Public packages are free with no limits, private ones only within a small quota, and the image contains no secrets: keys live only in the VM's `.env`.

1. On GitHub, click your avatar → **Your profile** → tab **Packages** → **earnings-tracker-backend**.
2. **Package settings** (right side) → **Danger Zone** → **Change visibility** → **Public** → type the package name → confirm.

(If you prefer to keep it private: on the VM, run `docker login ghcr.io -u <your-github-user>` once with a classic personal access token that has only the `read:packages` scope as the password.)

### 7.4 Start the stack on the VM (first time)
```bash
VM$ cd /opt/earnings-tracker
VM$ docker compose pull
VM$ docker compose up -d
VM$ docker compose ps
```
**You should see:** three containers. `app` shows `(health: starting)`, then `(healthy)` within a minute; `caddy` and `duckdns` show `Up`.

Watch Caddy get the certificate (Ctrl+C to stop watching):
```bash
VM$ docker compose logs -f caddy
```
**You should see:** a line containing `certificate obtained successfully` with your domain.

Then, from your computer:
```powershell
PC> curl.exe https://YOURNAME.duckdns.org/api/health
```
**You should see:** `{"status":"UP"}`.

On its first start the app runs the `calendar-refresh` job (up to about 30 minutes: 1,500 company lookups at Finnhub's free rate). The calendar fills in meanwhile.

If it does not work, see **Troubleshooting** at the end of this guide.

### 7.5 A deploy key for GitHub
GitHub needs its own SSH key to log in to the VM. Create a separate key for it, not your personal one, so you can revoke it on its own. It has no passphrase, because GitHub cannot type one.
```powershell
PC> ssh-keygen -t ed25519 -f $HOME\.ssh\earnings_ci -C "github-actions-deploy"
```
Press **Enter twice** at the passphrase prompts. Then add the public half to the VM's list of allowed keys, and log in with the new key to test it:
```powershell
PC> scp -i $HOME\.ssh\oracle_ed25519 $HOME\.ssh\earnings_ci.pub ubuntu@VM_IP:/tmp/earnings_ci.pub
PC> ssh -i $HOME\.ssh\oracle_ed25519 ubuntu@VM_IP "cat /tmp/earnings_ci.pub >> ~/.ssh/authorized_keys && rm /tmp/earnings_ci.pub"
PC> ssh -i $HOME\.ssh\earnings_ci ubuntu@VM_IP "docker compose version"
```
**You should see:** `Docker Compose version v2.x`, printed from the VM using the new key.

### 7.6 The VM's host key
This lets GitHub check that it is really talking to your VM. Use **Git Bash** for these two commands (Windows PowerShell 5.1 alters text piped between programs):
```bash
PC> ssh-keyscan -t ed25519 YOURNAME.duckdns.org 2>/dev/null
```
**You should see:** one line like `YOURNAME.duckdns.org ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA…`. Copy that whole line.

To be sure it is your VM's key, compare fingerprints. The two commands must print the same `SHA256:…` value:
```bash
PC> ssh-keyscan -t ed25519 YOURNAME.duckdns.org 2>/dev/null | ssh-keygen -lf -
```
```bash
VM$ ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

### 7.7 GitHub secrets and the deploy switch
Repository → **Settings** → **Secrets and variables** → **Actions**.

Tab **Secrets** → **New repository secret**, four times:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `YOURNAME.duckdns.org`: exactly the host you used in 7.6 |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | the entire content of the **private** key file `earnings_ci`, including the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END …-----` lines. Copy it with: `Get-Content $HOME\.ssh\earnings_ci -Raw \| Set-Clipboard` |
| `DEPLOY_KNOWN_HOSTS` | the line from 7.6 |

Tab **Variables** → **New repository variable**: name `DEPLOY_ENABLED`, value `true`.

Nothing else is needed: the workflow pushes the image with the automatic `GITHUB_TOKEN`.

### 7.8 First automatic deploy
**Actions** → **Backend** → **Run workflow** → branch `main` → **Run workflow**.

**You should see:** all three jobs green; the "Pull the new image and restart" step ends with `The app is healthy.`

From now on, every push to `main` that touches the backend is tested, built and deployed automatically. The only downtime is the app's restart, 10–20 seconds during which the API answers 502. If the tests fail, nothing is deployed.

---

## 8. Verification checklist

Run these from **Git Bash** on your computer, in the `backend` folder. Tick each one.

**1. Health**
```bash
curl -s https://YOURNAME.duckdns.org/api/health
```
Expected: `{"status":"UP"}`

**2. A real Firebase ID token.** The script signs in to your real Firebase project with Email/Password. It asks for a password: choose a new one on the first run, and it is never shown. Use an email that is in `ALLOWED_EMAILS`.
```bash
export FIREBASE_WEB_API_KEY=AIza...          # from 1.5
./scripts/firebase-token.sh --signup you@gmail.com
```
Expected: "Created you@gmail.com and sent a verification email". Open that email and click the link (check spam). Then:
```bash
export TOKEN=$(./scripts/firebase-token.sh you@gmail.com)
```
The token is valid for 1 hour; rerun the line to get a new one. If the email already signs in with Google, `--signup` fails with `EMAIL_EXISTS`: use the frontend instead once it's deployed, or use your other allowed email for this test.

**3. `/api/me`**
```bash
curl -s -H "Authorization: Bearer $TOKEN" https://YOURNAME.duckdns.org/api/me
```
Expected: `{"uid":"…","email":"you@gmail.com","allowed":true}`. A `403` means the email is not in `ALLOWED_EMAILS` or not verified yet.

**4. Search, stock details, calendar (the smoke test)**
```bash
./scripts/smoke.sh https://YOURNAME.duckdns.org
```
Expected: every line starts with `OK`: search, AAPL and SAP.DE (overview, prices, history, earnings, recommendations, news, peers), calendar, followed earnings, and the 404/400 checks. The first run takes up to a minute while caches fill.

**5. The test email**
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" https://YOURNAME.duckdns.org/api/notifications/test
```
Expected: `{"sentTo":"you@gmail.com"}`, and within a minute an email "[Test] Upcoming earnings: …" arrives. If you follow no stocks yet, it shows sample data. Look in spam the first time and mark it "Not spam". A `503` means the Gmail settings are wrong (section 3, then 9.4).

**6. A manual job run**
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" https://YOURNAME.duckdns.org/api/admin/jobs/prices-refresh/run
```
Expected: `{"jobName":"prices-refresh","startedAt":"…"}`. Then, in the Firebase console → **Firestore Database** → **Data** → `jobRuns` → `prices-refresh`: `lastResult` is `success` and `lastSuccess` is a moment ago.

Recommended once: start `eu-universe-refresh` the same way (it takes about 20 minutes), so European earnings dates appear in the calendar before its first scheduled Sunday run.

**7. API docs:** <https://YOURNAME.duckdns.org/swagger-ui.html> opens. Calls made from it need **Authorize** → paste the token.

---

## 9. Operations

All VM commands run in `/opt/earnings-tracker` (`cd /opt/earnings-tracker` after logging in).

### 9.1 Logs and status
```bash
VM$ docker compose ps                       # state and health of the three containers
VM$ docker compose logs -f app              # follow the app log (Ctrl+C stops following, not the app)
VM$ docker compose logs --since 2h app      # the last two hours
VM$ docker compose logs caddy               # certificates and proxy errors
```
Job runs appear in the app log as `Job calendar-refresh started` and `… finished in N s: {…}`.

### 9.2 Restart
```bash
VM$ docker compose restart app              # restart the app only
VM$ docker compose down && docker compose up -d   # restart everything
```
Never add `-v` to `down`: it deletes the certificate volume, and Let's Encrypt limits how often you can request new certificates.

Containers start automatically after a VM reboot (`restart: unless-stopped`).

### 9.3 Change `.env`
```bash
VM$ nano .env
VM$ docker compose up -d
```
`up -d` recreates the containers whose settings changed. (`restart` does **not** re-read `.env`.)

### 9.4 Roll back to an earlier version
Every build is also tagged with its commit, e.g. `sha-1a2b3c4` (listed on the package page on GitHub). Add this line to `.env`:
```
APP_IMAGE=ghcr.io/<your-github-user>/earnings-tracker-backend:sha-1a2b3c4
```
then run `docker compose up -d`. While the line is there, automatic deploys keep running that version. Remove it and run `docker compose up -d` to return to `latest`.

### 9.5 Rotate keys and passwords
After each change: edit `.env` (or replace the file) on the VM, then `docker compose up -d`.

| Secret | How to rotate |
|---|---|
| Finnhub / Twelve Data / FMP key | Create a new key in the provider's dashboard (Twelve Data and FMP can have several; Finnhub: dashboard or support), update `.env`, then delete the old key. |
| Gmail app password | <https://myaccount.google.com/apppasswords>: create a new one, update `MAIL_APP_PASSWORD`, then delete the old one there. |
| Firebase service-account key | Firebase console → Project settings → Service accounts → **Generate new private key**. Copy it to the VM as `firebase-sa.json` (as in 6.3), `chmod 600 firebase-sa.json`, `docker compose up -d --force-recreate app`. Then delete the old key: Google Cloud console → **IAM & Admin → Service Accounts** → `firebase-adminsdk-…` → **Keys**. |
| DuckDNS token | duckdns.org → **recreate token**, update `DUCKDNS_TOKEN`. |
| CI deploy key | Create a new pair (7.5), replace its line in the VM's `~/.ssh/authorized_keys` (`nano ~/.ssh/authorized_keys`), and update the `DEPLOY_SSH_KEY` secret. |

### 9.6 Check the scheduled jobs
Schedules (Europe/Prague time): `calendar-refresh` daily 06:00, `market-events-refresh` daily 06:30, `eu-universe-refresh` Sunday 03:00, `prices-refresh` daily 23:30, `earnings-digest` daily 12:00.

Firebase console → **Firestore Database** → **Data** → collection **`jobRuns`** → one document per job:
- `lastStart`, `lastSuccess`, `running`, `trigger` (`schedule`, `startup` or `manual`)
- `lastResult` (`success` / `failure`) and, after a failure, `lastError.message`
- `stats`: what the run did, including `firestoreReads` and `firestoreWrites`

Run any job now: `POST /api/admin/jobs/<name>/run` (as in section 8, step 6). Jobs are safe to rerun: the digest never emails anyone twice on the same day.

### 9.7 Ubuntu updates and disk space
Ubuntu installs security updates automatically. Once a month:
```bash
VM$ sudo apt update && sudo apt -y upgrade
VM$ [ -f /var/run/reboot-required ] && sudo reboot
VM$ df -h /                  # disk use; stay below ~80%
VM$ docker system df         # space used by images
VM$ docker image prune -f    # delete unused images (the deploy job also does this)
```

### 9.8 Confirm the monthly cost is $0
- **Oracle:** **☰ → Billing & Cost Management → Cost analysis**: the current month shows **0.00**. **Budgets** shows `zero-cost-guard` with no alert fired. Your instance page shows the **Always Free-eligible** shape. Anything else you create in Oracle may cost money; check for the Always Free label first.
- **Firebase:** gear → **Usage and billing**: plan **Spark** (no cost). **Firestore Database → Usage**: daily reads and writes are well below 50,000 and 20,000. Measured for this backend: the first `calendar-refresh` into an empty database used about 7,300 reads and 3,600 writes, and later days use less (each run writes only what changed).
- **GitHub:** public packages are free. Actions minutes are free for public repositories; a private repository gets 2,000 free minutes per month, and one backend run takes about 6.
- **Gmail, DuckDNS, Finnhub, Twelve Data, FMP:** free plans, with no card on file.

---

## Troubleshooting

**`curl https://YOURNAME.duckdns.org/api/health` fails**
1. `nslookup YOURNAME.duckdns.org` must return `VM_IP`. If not, fix the IP on duckdns.org and check `docker compose logs duckdns`.
2. `curl.exe -v http://YOURNAME.duckdns.org/api/health` should get a `308` redirect to HTTPS from Caddy. A timeout means port 80 is blocked: check both firewalls (4.7 a and b).
3. `docker compose logs caddy`: errors mentioning "challenge" or "timeout" mean Let's Encrypt cannot reach port 80/443 (firewalls again). "too many certificates" or "rate limit" means waiting (up to an hour, or a week for the weekly limit) before Caddy retries by itself.
4. `docker compose ps`: if `app` is `unhealthy` or restarting, see the next item.

**The app does not become healthy**, so run `docker compose logs --tail 100 app`:
- `Firebase is required but the key file /run/secrets/firebase-sa.json does not exist or is not readable`: `firebase-sa.json` is missing from `/opt/earnings-tracker`, or `APP_USER` in `.env` doesn't match its owner. Run `sudo chown ubuntu:ubuntu firebase-sa.json && chmod 600 firebase-sa.json`, check that `APP_USER` equals `echo "$(id -u):$(id -g)"`, then `docker compose up -d`. If the file is missing entirely, `docker compose up` itself refuses to start and names the secret file.
- `FIREBASE_PROJECT_ID '…' differs from the key's project '…'`, or 401 on every call: `FIREBASE_PROJECT_ID` in `.env` must be the project the key and the frontend belong to.
- `ALLOWED_EMAILS is empty, so nobody can use the API`: fill it in `.env`, then run `docker compose up -d`.

**Every API call returns 401:** the token expired (1 hour), or it belongs to another Firebase project. **403 `NOT_ALLOWED`:** the message says whether the email is not on the allowlist or not verified.

**Test email returns 503:** `MAIL_USERNAME` / `MAIL_APP_PASSWORD` is empty or wrong, the app password was deleted, or 2-Step Verification was turned off (which revokes app passwords). Create a new app password (section 3). The app log line `Test email failed: …` says which.

**`docker compose pull` says `denied` or `unauthorized`:** the package is still private (7.3), or `APP_IMAGE` in `.env` points at a tag that does not exist.

**Workflow: "Host key verification failed":** `DEPLOY_KNOWN_HOSTS` does not match `DEPLOY_HOST`. Rerun 7.6 with exactly the text in `DEPLOY_HOST`.
**Workflow: "Permission denied (publickey)":** `DEPLOY_SSH_KEY` must be the private key including the BEGIN/END lines, and its `.pub` must be in the VM's `~/.ssh/authorized_keys` (7.5).
**Workflow: the deploy job is skipped:** the repository variable `DEPLOY_ENABLED` must be exactly `true` (7.7).

**The VM became unreachable after a while:** check its state in the Oracle console. A **Stopped** instance on a free-tier account was reclaimed for idleness, so upgrade to PAYG (4.2) and start it. If Oracle shows maintenance, wait; the containers restart by themselves after the reboot.

**"Out of host capacity" when creating the VM:** see 4.5.
