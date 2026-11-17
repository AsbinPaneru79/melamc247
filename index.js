const mineflayer = require('mineflayer');
const http = require('http');

// Configuration
// melamc.playmc.world uses an SRV record pointing directly to eu1.freegamehost.xyz:28430
const CONFIG = {
  host: process.env.MC_HOST || 'eu1.freegamehost.xyz',
  port: parseInt(process.env.MC_PORT, 10) || 28430,
  username: process.env.MC_USERNAME || 'SoNar',
  passwordCommand: '/login tynorix$',
  passwordText: 'tynorix$',
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

// 3. GUI Login Handler (Types password into text box and clicks green button)
async function handleLoginGui(window) {
  console.log(`[GUI] Window opened: type="${window.type || 'unknown'}", title="${window.title || ''}"`);

  // 1. Type password 'tynorix$' into the box (Anvil / Item Name packet)
  const password = CONFIG.passwordText;
  for (let i = 1; i <= password.length; i++) {
    const substr = password.substring(0, i);
    try {
      if (bot.supportFeature && bot.supportFeature('useMCItemName')) {
        bot._client.writeChannel('MC|ItemName', substr);
      } else {
        bot._client.write('name_item', { name: substr });
      }
    } catch (e) {
      try {
        bot._client.write('custom_payload', {
          channel: 'MC|ItemName',
          data: Buffer.from(substr, 'utf8')
        });
      } catch (err) {}
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  console.log(`[GUI] Typed "${password}" into the login box.`);

  // 2. Wait for server to update items in the window
  await new Promise((r) => setTimeout(r, 600));

  // 3. Find and click the green login button below / output slot
  let clicked = false;

  if (window.slots && window.slots.length > 0) {
    for (let slot = 0; slot < window.slots.length; slot++) {
      const item = window.slots[slot];
      if (!item) continue;

      const name = (item.name || '').toLowerCase();
      const displayName = (item.displayName || '').toLowerCase();
      const customName = (item.customName || '').toLowerCase();

      // Check for green items (lime/green wool, glass, emerald, concrete) or text matching login/confirm
      const isGreen = name.includes('lime') || name.includes('green') || name.includes('emerald');
      const isLoginText = displayName.includes('login') || displayName.includes('log in') ||
                          displayName.includes('confirm') || displayName.includes('submit') ||
                          customName.includes('login');

      if (isGreen || isLoginText) {
        console.log(`[GUI] Found green login button at slot ${slot} (${item.name} / "${item.displayName || ''}"). Clicking...`);
        try {
          await bot.clickWindow(slot, 0, 0);
          clicked = true;
          break;
        } catch (err) {
          console.warn(`[GUI] Error clicking slot ${slot}:`, err.message);
        }
      }
    }
  }

  // Fallback for Anvil GUI: slot 2 is the output/result slot
  if (!clicked && (window.type.includes('anvil') || (window.slots && window.slots.length === 3))) {
    console.log('[GUI] Anvil window detected: Clicking slot 2 (output button)...');
    try {
      await bot.clickWindow(2, 0, 0);
      clicked = true;
    } catch (err) {
      console.warn('[GUI] Error clicking anvil slot 2:', err.message);
    }
  }

  // 4. Resume anti-AFK movement after unfreeze
  setTimeout(() => {
    if (bot) {
      console.log('[Bot] Login window processed. Resuming 7-block anti-AFK movement!');
      startAntiAfkLoop();
    }
  }, 3500);
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

  // Spawn Event (Initial Join)
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

  // Death Event: Auto-click Respawn button
  bot.on('death', () => {
    console.log('[Bot] SoNar died! Automatically clicking the Respawn button...');
    stopMovement();

    setTimeout(() => {
      if (!bot) return;
      try {
        if (typeof bot.respawn === 'function') {
          bot.respawn();
        }
      } catch (e) {}
      try {
        bot._client.write('client_command', bot.supportFeature('respawnIsPayload') ? { payload: 0 } : { actionId: 0 });
      } catch (e) {}
    }, 1000);
  });

  // Respawn Event: Re-login and resume movement
  bot.on('respawn', () => {
    console.log('[Bot] SoNar respawned in world.');

    // In case server expects chat login after respawn
    setTimeout(() => {
      if (!bot) return;
      console.log(`[Bot] Sending chat login after respawn: ${CONFIG.passwordCommand}`);
      bot.chat(CONFIG.passwordCommand);
    }, 1500);

    setTimeout(() => {
      if (bot && !movementTimeout) {
        console.log('[Bot] Respawn sequence complete. Resuming anti-AFK movement!');
        startAntiAfkLoop();
      }
    }, 4500);
  });

  // Window Open Event: Handles GUI login box and clicks green button
  bot.on('windowOpen', (window) => {
    handleLoginGui(window);
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
