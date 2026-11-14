const mineflayer = require('mineflayer');
const http = require('http');

// Configuration
// melamc.playmc.world uses an SRV record pointing directly to eu1.freegamehost.xyz:28430
const CONFIG = {
  host: process.env.MC_HOST || 'eu1.freegamehost.xyz',
  port: parseInt(process.env.MC_PORT, 10) || 28430,
  username: process.env.MC_USERNAME || 'SoNar',
  passwordCommand: '/login tynorix$',
  version: process.env.MC_VERSION || '1.8.9',
  webPort: process.env.PORT || 3000,
  reconnectDelay: 10000 // 10 seconds before attempting reconnect
};

// 1. Lightweight Web Server (Required by Railway, Render, and UptimeRobot)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Minecraft AFK Bot is alive. Connected to ${CONFIG.host}:${CONFIG.port}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(CONFIG.webPort) + 1;
    console.warn(`[Web] Port ${CONFIG.webPort} is in use, attempting port ${nextPort}...`);
    CONFIG.webPort = nextPort;
    server.listen(CONFIG.webPort, '0.0.0.0');
  } else {
    console.error('[Web] Server error:', err.message);
  }
});

// Explicitly bind to '0.0.0.0' for Railway / Render container health checks
server.listen(CONFIG.webPort, '0.0.0.0', () => {
  console.log(`[Web] HTTP health check listening on 0.0.0.0:${CONFIG.webPort} for Railway/Render.`);
});

// 2. Anti-AFK Movement & Bot Logic
let bot = null;
let movementTimeout = null;
let isReconnecting = false;

function stopMovement() {
  if (movementTimeout) {
    clearTimeout(movementTimeout);
    movementTimeout = null;
  }
  if (bot) {
    bot.clearControlStates();
  }
}

function startAntiAfkLoop() {
  stopMovement();
  console.log('[Anti-AFK] Initializing anti-cheat friendly routine (7 blocks forward <-> 7 blocks back)...');

  // Walking forward/backward generates standard vanilla packets that avoid anti-cheat flags
  const MOVE_TIME_MS = 1650; // ~7 blocks at normal walking speed (~4.3 blocks/s)
  const PAUSE_TIME_MS = 1000;

  function stepForward() {
    if (!bot || !bot.entity) return;
    const startX = bot.entity.position.x;
    const startZ = bot.entity.position.z;
    console.log(`[Anti-AFK] Walking FORWARD 7 blocks... (Current Pos: X=${startX.toFixed(1)}, Z=${startZ.toFixed(1)})`);

    bot.swingArm();
    bot.setControlState('back', false);
    bot.setControlState('forward', true);

    movementTimeout = setTimeout(() => {
      if (!bot) return;
      bot.setControlState('forward', false);

      const dx = bot.entity.position.x - startX;
      const dz = bot.entity.position.z - startZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      console.log(`[Anti-AFK] Completed forward movement (${dist.toFixed(1)} blocks traveled). Pausing...`);

      movementTimeout = setTimeout(stepBack, PAUSE_TIME_MS);
    }, MOVE_TIME_MS);
  }

  function stepBack() {
    if (!bot || !bot.entity) return;
    const startX = bot.entity.position.x;
    const startZ = bot.entity.position.z;
    console.log(`[Anti-AFK] Walking BACKWARD 7 blocks... (Current Pos: X=${startX.toFixed(1)}, Z=${startZ.toFixed(1)})`);

    bot.swingArm();
    bot.setControlState('forward', false);
    bot.setControlState('back', true);

    movementTimeout = setTimeout(() => {
      if (!bot) return;
      bot.setControlState('back', false);

      const dx = bot.entity.position.x - startX;
      const dz = bot.entity.position.z - startZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      console.log(`[Anti-AFK] Returned to start position (${dist.toFixed(1)} blocks traveled). Pausing...`);

      movementTimeout = setTimeout(stepForward, PAUSE_TIME_MS);
    }, MOVE_TIME_MS);
  }

  // Start after an initial pause
  movementTimeout = setTimeout(stepForward, PAUSE_TIME_MS);
}

function initBot() {
  isReconnecting = false;

  // Resolve hostname if alias is given
  let targetHost = CONFIG.host;
  let targetPort = CONFIG.port;
  if (targetHost === 'melamc.playmc.world') {
    targetHost = 'eu1.freegamehost.xyz';
    targetPort = 28430;
  }

  console.log(`[Bot] Connecting to ${targetHost}:${targetPort} as ${CONFIG.username} (Version: ${CONFIG.version})...`);

  bot = mineflayer.createBot({
    host: targetHost,
    port: targetPort,
    username: CONFIG.username,
    version: CONFIG.version,
    auth: 'offline', // Offline mode authentication
    checkTimeoutInterval: 60000
  });

  bot.once('spawn', () => {
    console.log('[Bot] Successfully spawned in world.');

    // 1. Wait 1.5 seconds after spawn to send the login command
    setTimeout(() => {
      if (!bot) return;
      console.log(`[Bot] Executing login command: ${CONFIG.passwordCommand}`);
      bot.chat(CONFIG.passwordCommand);

      // 2. Wait 3.5 seconds after sending /login for authentication & teleport unfreeze
      console.log('[Bot] Waiting for server authentication and spawn unfreeze...');
      setTimeout(() => {
        if (!bot) return;
        console.log('[Bot] Authentication complete. Starting 7-block anti-AFK movement!');
        startAntiAfkLoop();
      }, 3500);
    }, 1500);
  });

  // Log incoming chat messages
  bot.on('message', (message) => {
    console.log(`[Chat] ${message.toAnsi ? message.toAnsi() : message.toString()}`);
  });

  bot.on('kicked', (reason) => {
    console.warn('[Bot] Bot was kicked:', reason);
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    console.error('[Bot] Connection error:', err.message);
    scheduleReconnect();
  });

  bot.on('end', () => {
    console.warn('[Bot] Connection ended.');
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  stopMovement();
  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }

  if (isReconnecting) return;
  isReconnecting = true;

  console.log(`[Bot] Reconnecting in ${CONFIG.reconnectDelay / 1000} seconds...`);
  setTimeout(() => {
    initBot();
  }, CONFIG.reconnectDelay);
}

// Start the bot
initBot();
