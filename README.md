# Minecraft AFK Bot (Mineflayer 1.8.9)

A Minecraft AFK bot created with Mineflayer that:
- Connects to server `SoNar` (or configured host) with version `1.8.9`.
- Sends `/login tynorix$` upon spawning.
- Moves continuously 10 blocks left and 10 blocks right to prevent AFK kicks.
- Automatically reconnects if kicked or disconnected.
- Runs a lightweight HTTP server on port `PORT` so it can be hosted on Render and kept alive via UptimeRobot.

---

## 1. Local Testing

1. Open a terminal in this folder:
   ```bash
   cd C:/Users/Consistent/.gemini/antigravity/scratch/minecraft-afk-bot
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the bot:
   ```bash
   npm start
   ```

---

## 2. Push to GitHub

1. Initialize Git repository and commit:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Minecraft AFK bot"
   ```
2. Create a new repository on [GitHub](https://github.com/new).
3. Push to GitHub:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
   git push -u origin main
   ```

---

## 3. Deploy to Render

1. Log into [Render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Configure the service:
   - **Name:** `minecraft-afk-bot`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. *(Optional)* Add Environment Variables if your server IP/domain is not just `SoNar`:
   - `MC_HOST`: The exact server address/IP
   - `MC_PORT`: Server port (default `25565`)
   - `MC_USERNAME`: `tynorix`
6. Click **Create Web Service**. Wait for the build to finish. Once live, Render will give you a public URL (e.g. `https://minecraft-afk-bot.onrender.com`).

---

## 4. Setup UptimeRobot

Render free instances spin down after 15 minutes of inactivity. UptimeRobot keeps the service active 24/7 by pinging the HTTP server:

1. Log in to [UptimeRobot](https://uptimerobot.com).
2. Click **Add New Monitor**.
3. Choose:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `Minecraft AFK Bot`
   - **URL (or IP):** `https://<YOUR-RENDER-APP-NAME>.onrender.com`
   - **Monitoring Interval:** `Every 5 minutes`
4. Click **Create Monitor**.
