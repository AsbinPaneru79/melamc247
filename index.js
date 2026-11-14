const mineflayer = require('mineflayer');
const http = require('http');

// Configuration
// If 'SoNar' is a local server name, replace with the exact IP/domain (e.g. 'sonar.example.com')
const CONFIG = {
  host: process.env.MC_HOST || 'SoNar',
  port: parseInt(process.env.MC_PORT, 10) || 25565,
  username: process.env.MC_USERNAME || 'tynorix',
  passwordCommand: '/login tynorix$',
  version: '1.8.9',
  webPort: process.env.PORT || 3000,
  reconnectDelay: 10000 // 10 seconds before attempting reconnect
};

// 1. Lightweight Web Server (Required by Render & UptimeRobot)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Minecraft AFK Bot is alive. Target: ${CONFIG.host}:${CONFIG.port}\n`);
});

server.listen(CONFIG.webPort, () => {
  console.log(`[Web] HTTP server listening on port ${CONFIG.webPort} for UptimeRobot pings.`);
});

// 2. Bot Management & Anti-AFK Logic
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

  // Minecraft standard walk speed is ~4.3 blocks/s.
  // 2300ms of walking covers ~10 blocks.
  const MOVE_DURATION_MS = 2300;
  const PAUSE_DURATION_MS = 500;

  function moveLeft() {
    if (!bot || !bot.entity) return;
    bot.setControlState('left', true);
    bot.setControlState('right', false);

    movementTimeout = setTimeout(() => {
      if (!bot) return;
      bot.setControlState('left', false);

      movementTimeout = setTimeout(moveRight, PAUSE_DURATION_MS);
    }, MOVE_DURATION_MS);
  }

  function moveRight() {
    if (!bot || !bot.entity) return;
    bot.setControlState('right', true);
    bot.setControlState('left', false);

    movementTimeout = setTimeout(() => {
      if (!bot) return;
      bot.setControlState('right', false);

      movementTimeout = setTimeout(moveLeft, PAUSE_DURATION_MS);
    }, MOVE_DURATION_MS);
  }

  // Initial delay before starting movement
  movementTimeout = setTimeout(moveLeft, 2000);
}

function initBot() {
  isReconnecting = false;
  console.log(`[Bot] Connecting to ${CONFIG.host}:${CONFIG.port} with version ${CONFIG.version}...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version,
    checkTimeoutInterval: 30000
  });

  bot.once('spawn', () => {
    console.log('[Bot] Successfully spawned in world.');

    // Wait 1.5 seconds after spawn to send the login command
    setTimeout(() => {
      if (bot) {
        console.log(`[Bot] Executing login command: ${CONFIG.passwordCommand}`);
        bot.chat(CONFIG.passwordCommand);
      }
    }, 1500);

    // Start 10-block left/right continuous movement loop
    startAntiAfkLoop();
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

// Start the bot initially
initBot();
