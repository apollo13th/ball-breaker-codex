(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const scoreElement = document.querySelector("#score");
  const livesElement = document.querySelector("#lives");
  const levelElement = document.querySelector("#level");
  const powerupElement = document.querySelector("#active-powerups");
  const gameFrame = document.querySelector(".game-frame");
  const overlay = document.querySelector("#overlay");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const startButton = document.querySelector("#start-button");
  const soundButton = document.querySelector("#sound-toggle");
  const launchButton = document.querySelector("#launch-button");
  const pauseButton = document.querySelector("#pause-button");
  const moveLeftButton = document.querySelector("#move-left");
  const moveRightButton = document.querySelector("#move-right");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const BASE_PADDLE_WIDTH = 92;
  const BASE_BALL_RADIUS = 8;
  const EFFECT_DURATION = 15000;
  const SHORT_EFFECT_DURATION = 10000;
  const NARROW_EFFECT_DURATION = 8000;
  const POWERUP_TYPES = ["grow", "shield", "big", "sticky", "ghost", "tiny", "narrow"];
  const POWERUP_CONFIG = {
    grow: { label: "Wide Paddle", letter: "G", color: "#7ee2ff" },
    shield: { label: "Shield Ready", letter: "S", color: "#bf8cff" },
    big: { label: "Big Ball", letter: "B", color: "#ffe56b" },
    sticky: { label: "Directional Shot", letter: "K", color: "#ffad66" },
    ghost: { label: "Phase Ball", letter: "P", color: "#5fffd4" },
    tiny: { label: "Tiny Ball", letter: "T", color: "#ff8f70" },
    narrow: { label: "Narrow Paddle", letter: "N", color: "#ff668f" },
  };

  let soundEnabled = true;
  let audioContext;
  let animationFrame;
  let lastTimestamp = 0;
  let state = "ready";
  let score = 0;
  let lives = 3;
  let level = 1;
  let combo = 0;
  let powerupBag = [];
  let keys = { left: false, right: false };
  let activeEffects = createEmptyEffects();
  let powerups = [];
  let particles = [];
  let brickShards = [];
  let shockwaves = [];
  let shakeTime = 0;
  let shakeAmount = 0;
  let stickyAim = null;

  const paddle = {
    x: WIDTH / 2 - BASE_PADDLE_WIDTH / 2,
    y: HEIGHT - 56,
    width: BASE_PADDLE_WIDTH,
    height: 13,
    speed: 430,
  };

  const ball = {
    x: WIDTH / 2,
    y: paddle.y - BASE_BALL_RADIUS - 2,
    vx: 195,
    vy: -330,
    radius: BASE_BALL_RADIUS,
    launched: false,
    stuck: false,
    stuckOffset: 0,
    lastBrickId: null,
  };

  let bricks = [];

  function createEmptyEffects() {
    return {
      growUntil: 0,
      bigUntil: 0,
      ghostUntil: 0,
      tinyUntil: 0,
      narrowUntil: 0,
      sticky: false,
      shield: false,
    };
  }

  function createBricks() {
    const rows = 7;
    const columns = 6;
    const gap = 7;
    const sidePadding = 18;
    const top = 62;
    const brickWidth = (WIDTH - sidePadding * 2 - gap * (columns - 1)) / columns;
    const palette = ["#7ee2ff", "#66c5ff", "#8c9cff", "#bf8cff", "#f987ca", "#ffe56b", "#ffad66"];
    bricks = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const maxHp = Math.min(4, 1 + Math.floor((level - 1 + Math.floor(row / 2)) / 2));
        bricks.push({
          id: `${level}-${row}-${column}`,
          x: sidePadding + column * (brickWidth + gap),
          y: top + row * 31,
          width: brickWidth,
          height: 21,
          color: palette[row],
          alive: true,
          row,
          column,
          bomb: level > 1 && Math.random() < Math.min(0.08 + level * 0.012, 0.2),
          hp: maxHp,
          maxHp,
          points: (rows - row) * 20,
        });
      }
    }
  }

  function resetBall(direction = 1) {
    const now = performance.now();
    ball.radius = activeEffects.bigUntil > now ? 14 : activeEffects.tinyUntil > now ? 4 : BASE_BALL_RADIUS;
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddle.y - ball.radius - 3;
    ball.vx = direction * (230 + level * 18);
    ball.vy = -(350 + level * 22);
    ball.launched = false;
    ball.stuck = false;
    ball.stuckOffset = 0;
    ball.lastBrickId = null;
    stickyAim = null;
  }

  function resetGame() {
    score = 0;
    lives = 3;
    level = 1;
    combo = 0;
    powerupBag = [];
    powerups = [];
    particles = [];
    brickShards = [];
    shockwaves = [];
    activeEffects = createEmptyEffects();
    shakeTime = 0;
    shakeAmount = 0;
    paddle.width = BASE_PADDLE_WIDTH;
    paddle.x = WIDTH / 2 - paddle.width / 2;
    createBricks();
    resetBall();
    updateHud();
  }

  function startGame() {
    if (state === "won" || state === "lost") {
      resetGame();
    }
    state = "playing";
    overlay.classList.add("hidden");
    scrollArenaIntoView();
    playTone(320, 0.08);
  }

  function togglePause() {
    if (state === "ready" || state === "won" || state === "lost") {
      startGame();
      return;
    }

    if (state === "paused") {
      state = "playing";
      overlay.classList.add("hidden");
    } else {
      state = "paused";
      showOverlay("SYSTEM HOLD", "Game paused.", "Take a breath. The grid will wait.", "Resume");
    }
  }

  function showOverlay(kicker, title, copy, buttonText) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    startButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  function launchBall() {
    if (state !== "playing") {
      return;
    }
    if (!ball.launched) {
      if (ball.stuck && stickyAim) {
        const dx = stickyAim.x - ball.x;
        const dy = Math.min(stickyAim.y - ball.y, -20);
        const speed = 350 + level * 22;
        const length = Math.hypot(dx, dy) || 1;
        ball.vx = (dx / length) * speed;
        ball.vy = (dy / length) * speed;
        activeEffects.sticky = false;
      }
      ball.launched = true;
      ball.stuck = false;
      stickyAim = null;
      playTone(410, 0.08);
    }
  }

  function playTone(frequency, duration, type = "sine") {
    if (!soundEnabled) {
      return;
    }
    try {
      audioContext ||= new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(0.035, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch {
      soundEnabled = false;
    }
  }

  function updatePaddle(deltaSeconds) {
    if (keys.left) {
      paddle.x -= paddle.speed * deltaSeconds;
    }
    if (keys.right) {
      paddle.x += paddle.speed * deltaSeconds;
    }
    paddle.x = clamp(paddle.x, 0, WIDTH - paddle.width);
  }

  function updateEffects(now) {
    const previousWidth = paddle.width;
    if (activeEffects.growUntil > now) {
      paddle.width = 154;
    } else if (activeEffects.narrowUntil > now) {
      paddle.width = 58;
    } else {
      paddle.width = BASE_PADDLE_WIDTH;
    }
    if (paddle.width !== previousWidth) {
      paddle.x = clamp(paddle.x - (paddle.width - previousWidth) / 2, 0, WIDTH - paddle.width);
    }

    if (activeEffects.bigUntil > now) {
      ball.radius = 14;
    } else if (activeEffects.tinyUntil > now) {
      ball.radius = 4;
    } else {
      ball.radius = BASE_BALL_RADIUS;
    }
  }

  function updateBall(deltaSeconds) {
    if (!ball.launched) {
      ball.x = ball.stuck
        ? clamp(paddle.x + ball.stuckOffset, paddle.x + ball.radius, paddle.x + paddle.width - ball.radius)
        : paddle.x + paddle.width / 2;
      ball.y = paddle.y - ball.radius - 3;
      return;
    }

    ball.x += ball.vx * deltaSeconds;
    ball.y += ball.vy * deltaSeconds;

    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= WIDTH) {
      ball.x = clamp(ball.x, ball.radius, WIDTH - ball.radius);
      ball.vx *= -1;
      increaseBallSpeed(1.015);
      ball.lastBrickId = null;
      playTone(170, 0.04);
    }

    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      increaseBallSpeed(1.015);
      activeEffects.ghostUntil = 0;
      ball.lastBrickId = null;
      triggerShake(0.1, 3);
      playTone(190, 0.04);
    }

    if (
      ball.vy > 0 &&
      ball.y + ball.radius >= paddle.y &&
      ball.y - ball.radius <= paddle.y + paddle.height &&
      ball.x >= paddle.x - ball.radius &&
      ball.x <= paddle.x + paddle.width + ball.radius
    ) {
      ball.y = paddle.y - ball.radius - 1;
      combo = 0;
      ball.lastBrickId = null;
      burst(ball.x, ball.y, "#7ee2ff", 7);
      if (activeEffects.sticky) {
        ball.launched = false;
        ball.stuck = true;
        ball.stuckOffset = ball.x - paddle.x;
        stickyAim = { x: ball.x, y: ball.y - 170 };
        playTone(380, 0.08, "triangle");
        return;
      }

      const hitPosition = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.035, 720);
      ball.vx = speed * hitPosition * 0.86;
      ball.vy = -Math.sqrt(Math.max(speed * speed - ball.vx * ball.vx, 170 * 170));
      playTone(260, 0.045);
    }

    checkBrickCollision();

    if (ball.y - ball.radius > HEIGHT) {
      handleMiss();
    }
  }

  function checkBrickCollision() {
    let collided = false;
    for (const brick of bricks) {
      if (!brick.alive || !circleHitsRect(ball, brick)) {
        continue;
      }

      collided = true;
      if (ball.lastBrickId === brick.id) {
        continue;
      }
      ball.lastBrickId = brick.id;

      if (activeEffects.ghostUntil <= performance.now()) {
        reflectBallFromBrick(brick);
        increaseBallSpeed(1.012);
      }
      damageBrick(brick, false, activeEffects.bigUntil > performance.now() ? 2 : 1);
      if (activeEffects.ghostUntil <= performance.now()) {
        break;
      }
    }

    if (!collided) {
      ball.lastBrickId = null;
    }

    if (bricks.every((candidate) => !candidate.alive)) {
      completeWave();
    }
  }

  function damageBrick(brick, fromExplosion = false, damage = 1) {
    brick.hp -= damage;
    burst(ball.x, ball.y, brick.color, brick.hp <= 0 ? 12 : 6);
    playTone(340 + combo * 14, 0.05, "square");
    if (brick.hp > 0) {
      triggerShake(0.08, 2);
      return;
    }

    brick.alive = false;
    combo += 1;
    score += brick.points * brick.maxHp + combo * 5;
    shatterBrick(brick);
    triggerShake(0.12, 3 + brick.maxHp);
    if (!fromExplosion && ((score + brick.points + combo) % 4 === 0 || Math.random() < 0.19)) {
      spawnPowerup(brick);
    }
    if (brick.bomb && !fromExplosion) {
      explodeBrick(brick);
    }
  }

  function explodeBrick(origin) {
    const queue = [origin];
    const exploded = new Set([origin.id]);
    let destroyed = 0;

    while (queue.length) {
      const current = queue.shift();
      for (const brick of bricks) {
        if (!brick.alive || exploded.has(brick.id)) {
          continue;
        }
        if (Math.abs(brick.row - current.row) <= 1 && Math.abs(brick.column - current.column) <= 1) {
          exploded.add(brick.id);
          brick.hp = 1;
          damageBrick(brick, true, brick.hp);
          destroyed += 1;
          if (brick.bomb) {
            queue.push(brick);
          }
        }
      }
    }

    shockwaves.push({ x: origin.x + origin.width / 2, y: origin.y + origin.height / 2, radius: 5, life: 0.55 });
    triggerShake(0.25, Math.min(10, 5 + destroyed));
    playTone(110, 0.2, "sawtooth");
  }

  function reflectBallFromBrick(brick) {
    const closestX = clamp(ball.x, brick.x, brick.x + brick.width);
    const closestY = clamp(ball.y, brick.y, brick.y + brick.height);
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;

    if (Math.abs(dx) > Math.abs(dy)) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }
  }

  function increaseBallSpeed(factor) {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (!speed) {
      return;
    }
    const nextSpeed = Math.min(speed * factor, 760);
    ball.vx = (ball.vx / speed) * nextSpeed;
    ball.vy = (ball.vy / speed) * nextSpeed;
  }

  function completeWave() {
    score += 1000 * level;
    level += 1;
    playTone(660, 0.18, "triangle");
    createBricks();
    resetBall(level % 2 ? 1 : -1);
    updateHud();
  }

  function handleMiss() {
    if (activeEffects.shield) {
      activeEffects.shield = false;
      ball.y = HEIGHT - 20 - ball.radius;
      ball.vy = -Math.abs(ball.vy);
      burst(ball.x, HEIGHT - 17, "#bf8cff", 24);
      playTone(560, 0.16, "sawtooth");
      updateHud();
      return;
    }

    lives -= 1;
    combo = 0;
    activeEffects = createEmptyEffects();
    powerups = [];
    updateEffects(performance.now());
    playTone(100, 0.22, "sawtooth");
    if (lives <= 0) {
      state = "lost";
      ball.launched = false;
      showOverlay("SIGNAL LOST", "Game over.", `Score: ${score.toLocaleString()}. Reboot and try again.`, "Reboot");
    } else {
      resetBall(lives % 2 ? 1 : -1);
    }
    updateHud();
  }

  function spawnPowerup(brick) {
    const type = drawPowerupType();
    powerups.push({
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height / 2,
      radius: 14,
      vy: 156,
      type,
    });
  }

  function drawPowerupType() {
    if (!powerupBag.length) {
      powerupBag = [...POWERUP_TYPES];
      for (let index = powerupBag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [powerupBag[index], powerupBag[swapIndex]] = [powerupBag[swapIndex], powerupBag[index]];
      }
    }
    return powerupBag.pop();
  }

  function updatePowerups(deltaSeconds, now) {
    for (const powerup of powerups) {
      powerup.y += powerup.vy * deltaSeconds;
      if (
        powerup.y + powerup.radius >= paddle.y &&
        powerup.y - powerup.radius <= paddle.y + paddle.height &&
        powerup.x >= paddle.x &&
        powerup.x <= paddle.x + paddle.width
      ) {
        powerup.collected = true;
        activatePowerup(powerup.type, now);
      }
    }

    powerups = powerups.filter((powerup) => !powerup.collected && powerup.y - powerup.radius < HEIGHT);
  }

  function activatePowerup(type, now = performance.now()) {
    if (type === "grow") {
      activeEffects.growUntil = now + EFFECT_DURATION;
      activeEffects.narrowUntil = 0;
    } else if (type === "big") {
      activeEffects.bigUntil = now + EFFECT_DURATION;
      activeEffects.tinyUntil = 0;
    } else if (type === "shield") {
      activeEffects.shield = true;
    } else if (type === "sticky") {
      activeEffects.sticky = true;
    } else if (type === "ghost") {
      activeEffects.ghostUntil = now + SHORT_EFFECT_DURATION;
    } else if (type === "tiny") {
      activeEffects.tinyUntil = now + SHORT_EFFECT_DURATION;
      activeEffects.bigUntil = 0;
    } else if (type === "narrow") {
      activeEffects.narrowUntil = now + NARROW_EFFECT_DURATION;
      activeEffects.growUntil = 0;
    }
    burst(paddle.x + paddle.width / 2, paddle.y, POWERUP_CONFIG[type].color, 18);
    playTone(type === "shield" ? 540 : 460, 0.13, "triangle");
    updateEffects(now);
    updateHud(now);
  }

  function updateParticles(deltaSeconds) {
    for (const particle of particles) {
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.vy += 160 * deltaSeconds;
      particle.life -= deltaSeconds;
    }
    particles = particles.filter((particle) => particle.life > 0);

    for (const shard of brickShards) {
      shard.x += shard.vx * deltaSeconds;
      shard.y += shard.vy * deltaSeconds;
      shard.vy += 310 * deltaSeconds;
      shard.rotation += shard.rotationSpeed * deltaSeconds;
      shard.life -= deltaSeconds;
    }
    brickShards = brickShards.filter((shard) => shard.life > 0);

    for (const shockwave of shockwaves) {
      shockwave.radius += 230 * deltaSeconds;
      shockwave.life -= deltaSeconds;
    }
    shockwaves = shockwaves.filter((shockwave) => shockwave.life > 0);

    shakeTime = Math.max(0, shakeTime - deltaSeconds);
  }

  function triggerShake(duration, amount) {
    shakeTime = Math.max(shakeTime, duration);
    shakeAmount = Math.max(shakeAmount, amount);
  }

  function burst(x, y, color, count) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 130;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1 + Math.random() * 3,
        color,
        life: 0.3 + Math.random() * 0.4,
      });
    }
  }

  function shatterBrick(brick) {
    const columns = 4;
    const rows = 2;
    const shardWidth = brick.width / columns;
    const shardHeight = brick.height / rows;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = brick.x + shardWidth * (column + 0.5);
        const y = brick.y + shardHeight * (row + 0.5);
        const direction = x < brick.x + brick.width / 2 ? -1 : 1;
        brickShards.push({
          x,
          y,
          width: shardWidth - 1,
          height: shardHeight - 1,
          vx: direction * (28 + Math.random() * 95),
          vy: -55 - Math.random() * 150,
          rotation: 0,
          rotationSpeed: (Math.random() - 0.5) * 12,
          color: brick.color,
          life: 0.72 + Math.random() * 0.28,
          maxLife: 1,
        });
      }
    }
  }

  function updateHud(now = performance.now()) {
    scoreElement.textContent = String(score).padStart(5, "0");
    livesElement.textContent = String(lives);
    levelElement.textContent = String(level).padStart(2, "0");

    const chips = [];
    if (activeEffects.growUntil > now) {
      chips.push(`<span class="power-chip grow">Wide ${secondsLeft(activeEffects.growUntil, now)}s</span>`);
    }
    if (activeEffects.shield) {
      chips.push('<span class="power-chip shield">Shield 1 hit</span>');
    }
    if (activeEffects.bigUntil > now) {
      chips.push(`<span class="power-chip big">Big ball ${secondsLeft(activeEffects.bigUntil, now)}s</span>`);
    }
    if (activeEffects.sticky) {
      chips.push('<span class="power-chip sticky">Directional shot</span>');
    }
    if (activeEffects.ghostUntil > now) {
      chips.push(`<span class="power-chip ghost">Phase ${secondsLeft(activeEffects.ghostUntil, now)}s</span>`);
    }
    if (activeEffects.tinyUntil > now) {
      chips.push(`<span class="power-chip tiny">Tiny ball ${secondsLeft(activeEffects.tinyUntil, now)}s</span>`);
    }
    if (activeEffects.narrowUntil > now) {
      chips.push(`<span class="power-chip narrow">Narrow ${secondsLeft(activeEffects.narrowUntil, now)}s</span>`);
    }
    powerupElement.innerHTML = chips.join("") || '<span class="empty-power">No boosts active</span>';
  }

  function secondsLeft(until, now) {
    return Math.max(1, Math.ceil((until - now) / 1000));
  }

  function drawBackground() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#040c12";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = "rgba(126, 226, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
  }

  function drawBricks() {
    const bombPulse = 0.5 + Math.sin(performance.now() / 145) * 0.5;
    for (const brick of bricks) {
      if (!brick.alive) {
        continue;
      }
      ctx.fillStyle = brick.color;
      ctx.globalAlpha = 0.85;
      if (brick.bomb) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = "#ff7b42";
      }
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(brick.x + 3, brick.y + 3, brick.width - 6, 2);
      ctx.strokeStyle = brick.color;
      ctx.strokeRect(brick.x - 1, brick.y - 1, brick.width + 2, brick.height + 2);
      if (brick.hp < brick.maxHp) {
        ctx.strokeStyle = "rgba(2, 10, 14, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(brick.x + brick.width * 0.34, brick.y + 3);
        ctx.lineTo(brick.x + brick.width * 0.56, brick.y + brick.height - 3);
        if (brick.hp < brick.maxHp - 1) {
          ctx.moveTo(brick.x + brick.width * 0.68, brick.y + 2);
          ctx.lineTo(brick.x + brick.width * 0.48, brick.y + brick.height - 2);
        }
        ctx.stroke();
      }
      if (brick.bomb) {
        drawBombMarker(brick, bombPulse);
      }
    }
  }

  function drawBombMarker(brick, pulse) {
    const centerX = brick.x + brick.width / 2;
    const centerY = brick.y + brick.height / 2 + 1;
    const radius = 5.2 + pulse * 0.7;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = `rgba(255, 126, 66, ${0.68 + pulse * 0.32})`;
    ctx.lineWidth = 2 + pulse * 0.8;
    ctx.shadowBlur = 10 + pulse * 12;
    ctx.shadowColor = "#ff6a36";
    ctx.strokeRect(brick.x - 2.5, brick.y - 2.5, brick.width + 5, brick.height + 5);

    ctx.fillStyle = "#42100d";
    ctx.strokeStyle = "#ffe7a8";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#ffe7a8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX + 3.3, centerY - 4);
    ctx.quadraticCurveTo(centerX + 7, centerY - 8, centerX + 8.5, centerY - 5.5);
    ctx.stroke();

    ctx.fillStyle = pulse > 0.48 ? "#fff6b5" : "#ff7b42";
    ctx.beginPath();
    ctx.arc(centerX + 9.2, centerY - 6.5, 1.8 + pulse * 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffbd66";
    ctx.beginPath();
    ctx.arc(centerX - 1.5, centerY - 1.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPaddle() {
    ctx.shadowBlur = 18;
    ctx.shadowColor = activeEffects.sticky ? "#ffad66" : activeEffects.narrowUntil > performance.now() ? "#ff668f" : "#7ee2ff";
    ctx.fillStyle = activeEffects.sticky ? "#ffe0a8" : activeEffects.narrowUntil > performance.now() ? "#ff9eb4" : "#d1f8ff";
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.fillStyle = activeEffects.sticky ? "#ffad66" : activeEffects.narrowUntil > performance.now() ? "#ff668f" : "#7ee2ff";
    ctx.fillRect(paddle.x + 6, paddle.y + 4, paddle.width - 12, 3);
    ctx.shadowBlur = 0;
  }

  function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.globalAlpha = activeEffects.ghostUntil > performance.now() ? 0.58 : 1;
    ctx.fillStyle = activeEffects.tinyUntil > performance.now() ? "#ffb093" : "#ffffff";
    ctx.shadowBlur = ball.radius * 2.2;
    ctx.shadowColor = activeEffects.ghostUntil > performance.now()
      ? "#5fffd4"
      : activeEffects.bigUntil > performance.now()
        ? "#ffe56b"
        : "#7ee2ff";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawShield() {
    if (!activeEffects.shield) {
      return;
    }
    ctx.strokeStyle = "#bf8cff";
    ctx.lineWidth = 4;
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#bf8cff";
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 17);
    ctx.lineTo(WIDTH, HEIGHT - 17);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#bf8cff";
    ctx.font = "700 12px monospace";
    ctx.fillText("SHIELD WALL // ARMED", 14, HEIGHT - 27);
  }

  function drawPowerups() {
    for (const powerup of powerups) {
      const config = POWERUP_CONFIG[powerup.type];
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y, powerup.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(5, 17, 25, 0.94)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = config.color;
      ctx.stroke();
      ctx.fillStyle = config.color;
      ctx.font = "700 15px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.letter, powerup.x, powerup.y + 1);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }

  function drawParticles() {
    for (const shockwave of shockwaves) {
      ctx.globalAlpha = Math.min(1, shockwave.life * 2);
      ctx.strokeStyle = "#ffad66";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(shockwave.x, shockwave.y, shockwave.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const shard of brickShards) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, shard.life * 1.6);
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.rotation);
      ctx.fillStyle = shard.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = shard.color;
      ctx.fillRect(-shard.width / 2, -shard.height / 2, shard.width, shard.height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
      ctx.fillRect(-shard.width / 2 + 1, -shard.height / 2 + 1, shard.width - 2, 2);
      ctx.restore();
    }

    for (const particle of particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawAimLine() {
    if (!ball.stuck || !stickyAim) {
      return;
    }
    ctx.fillStyle = "#ffad66";
    ctx.globalAlpha = 0.8;
    let carry = 0;
    const segments = getAimPreviewSegments();
    for (const segment of segments) {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      for (let distance = carry || 18; distance < length; distance += 18) {
        ctx.beginPath();
        ctx.arc(segment.start.x + ux * distance, segment.start.y + uy * distance, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      carry = (18 - ((length - carry) % 18)) % 18;
    }
    if (segments.length > 1) {
      const bounce = segments[0].end;
      ctx.strokeStyle = "#ffad66";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bounce.x, bounce.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function getAimPreviewSegments() {
    if (!ball.stuck || !stickyAim) {
      return [];
    }
    const dx = stickyAim.x - ball.x;
    const dy = Math.min(stickyAim.y - ball.y, -20);
    const length = Math.hypot(dx, dy) || 1;
    const velocity = { x: dx / length, y: dy / length };
    const first = traceToArenaWall({ x: ball.x, y: ball.y }, velocity);
    const reflected = {
      x: first.axis === "x" ? -velocity.x : velocity.x,
      y: first.axis === "y" ? -velocity.y : velocity.y,
    };
    const second = traceToArenaWall(first.point, reflected);
    return [
      { start: { x: ball.x, y: ball.y }, end: first.point },
      { start: first.point, end: second.point },
    ];
  }

  function traceToArenaWall(start, velocity) {
    const distances = [];
    if (velocity.x < 0) {
      distances.push({ distance: (ball.radius - start.x) / velocity.x, axis: "x" });
    } else if (velocity.x > 0) {
      distances.push({ distance: (WIDTH - ball.radius - start.x) / velocity.x, axis: "x" });
    }
    if (velocity.y < 0) {
      distances.push({ distance: (ball.radius - start.y) / velocity.y, axis: "y" });
    } else if (velocity.y > 0) {
      distances.push({ distance: (paddle.y - ball.radius - start.y) / velocity.y, axis: "y" });
    }
    const hit = distances.filter((candidate) => candidate.distance > 0.01).sort((a, b) => a.distance - b.distance)[0];
    return {
      axis: hit.axis,
      point: {
        x: start.x + velocity.x * hit.distance,
        y: start.y + velocity.y * hit.distance,
      },
    };
  }

  function drawLaunchPrompt() {
    if (ball.launched || state !== "playing") {
      return;
    }
    ctx.fillStyle = "rgba(209, 248, 255, 0.8)";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(ball.stuck ? "AIM, THEN TAP PADDLE OR LAUNCH" : "PRESS SPACE OR TAP TO LAUNCH", WIDTH / 2, HEIGHT - 92);
    ctx.textAlign = "start";
  }

  function render() {
    drawBackground();
    ctx.save();
    if (shakeTime > 0) {
      ctx.translate((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount);
    } else {
      shakeAmount = 0;
    }
    drawBricks();
    drawShield();
    drawPaddle();
    drawBall();
    drawPowerups();
    drawParticles();
    drawAimLine();
    drawLaunchPrompt();
    ctx.restore();
  }

  function frame(timestamp) {
    const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000 || 0, 0.033);
    lastTimestamp = timestamp;

    if (state === "playing") {
      updateEffects(timestamp);
      updatePaddle(deltaSeconds);
      updateBall(deltaSeconds);
      updatePowerups(deltaSeconds, timestamp);
      updateParticles(deltaSeconds);
      updateHud(timestamp);
    }

    render();
    animationFrame = requestAnimationFrame(frame);
  }

  function circleHitsRect(circle, rect) {
    const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
    const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    return dx * dx + dy * dy <= circle.radius * circle.radius;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function movePaddleTo(clientX) {
    const bounds = canvas.getBoundingClientRect();
    const canvasX = ((clientX - bounds.left) / bounds.width) * WIDTH;
    paddle.x = clamp(canvasX - paddle.width / 2, 0, WIDTH - paddle.width);
  }

  function canvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
    };
  }

  function pointNearPaddle(point) {
    return point.x >= paddle.x - 26 &&
      point.x <= paddle.x + paddle.width + 26 &&
      point.y >= paddle.y - 50 &&
      point.y <= paddle.y + paddle.height + 40;
  }

  function handleLaunchAction() {
    if (state === "ready" || state === "lost") {
      startGame();
    }
    if (state === "paused") {
      togglePause();
      return;
    }
    launchBall();
    scrollArenaIntoView();
  }

  function scrollArenaIntoView() {
    if (window.matchMedia("(max-width: 700px)").matches) {
      requestAnimationFrame(() => gameFrame.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function holdDirection(direction, held) {
    keys[direction] = held;
  }

  function bindHoldButton(button, direction) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      holdDirection(direction, true);
    });
    for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
      button.addEventListener(eventName, () => holdDirection(direction, false));
    }
  }

  startButton.addEventListener("click", startGame);
  launchButton.addEventListener("click", handleLaunchAction);
  pauseButton.addEventListener("click", togglePause);
  bindHoldButton(moveLeftButton, "left");
  bindHoldButton(moveRightButton, "right");
  soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundButton.querySelector("span").textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
    soundButton.setAttribute("aria-label", soundEnabled ? "Mute game sounds" : "Enable game sounds");
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "ArrowLeft") {
      keys.left = true;
    } else if (event.code === "ArrowRight") {
      keys.right = true;
    } else if (event.code === "Space") {
      event.preventDefault();
      if (state !== "playing" || ball.launched) {
        togglePause();
      } else {
        launchBall();
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft") {
      keys.left = false;
    } else if (event.code === "ArrowRight") {
      keys.right = false;
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (ball.stuck) {
      stickyAim = canvasPoint(event);
      return;
    }
    movePaddleTo(event.clientX);
  });

  canvas.addEventListener("pointerdown", (event) => {
    const point = canvasPoint(event);
    if (ball.stuck) {
      if (pointNearPaddle(point)) {
        launchBall();
      } else {
        stickyAim = point;
      }
      return;
    }
    movePaddleTo(event.clientX);
    if (state === "playing") {
      launchBall();
    }
  });

  window.__ballBreaker = {
    activatePowerup,
    simulateMiss: handleMiss,
    simulateWaveClear: () => {
      for (const brick of bricks) {
        brick.alive = false;
      }
      completeWave();
    },
    simulateBomb: () => {
      const origin = bricks.find((brick) => brick.alive);
      if (origin) {
        origin.bomb = true;
        origin.hp = 1;
        damageBrick(origin);
      }
    },
    showBombPreview: () => {
      for (const brick of bricks.filter((candidate) => candidate.alive).slice(1, 6)) {
        brick.bomb = true;
      }
    },
    simulateBrickHit: () => {
      const brick = bricks.find((candidate) => candidate.alive && candidate.maxHp > 1);
      if (brick) {
        damageBrick(brick);
      }
    },
    simulateBigBallHit: () => {
      const brick = bricks.find((candidate) => candidate.alive && candidate.maxHp > 1);
      if (brick) {
        damageBrick(brick, false, 2);
      }
    },
    simulateStickyCatch: () => {
      activeEffects.sticky = true;
      ball.x = paddle.x + paddle.width / 2;
      ball.y = paddle.y - ball.radius;
      ball.vy = 180;
      ball.launched = true;
      updateBall(0);
    },
    simulateBrickBreak: () => {
      const brick = bricks.find((candidate) => candidate.alive);
      if (brick) {
        brick.alive = false;
        shatterBrick(brick);
      }
    },
    drawPowerupSequence: (count) => Array.from({ length: count }, drawPowerupType),
    getSnapshot: () => ({
      state,
      score,
      lives,
      level,
      bricksRemaining: bricks.filter((brick) => brick.alive).length,
      shieldReady: activeEffects.shield,
      paddleWidth: paddle.width,
      paddleX: Math.round(paddle.x),
      ballRadius: ball.radius,
      ballLaunched: ball.launched,
      brickShardCount: brickShards.length,
      shockwaveCount: shockwaves.length,
      bombCount: bricks.filter((brick) => brick.alive && brick.bomb).length,
      damagedBrickCount: bricks.filter((brick) => brick.alive && brick.hp < brick.maxHp).length,
      maxBrickHp: Math.max(...bricks.filter((brick) => brick.alive).map((brick) => brick.maxHp), 0),
      ballStuck: ball.stuck,
      ghostActive: activeEffects.ghostUntil > performance.now(),
      tinyActive: activeEffects.tinyUntil > performance.now(),
      narrowActive: activeEffects.narrowUntil > performance.now(),
      stickyActive: activeEffects.sticky,
      aimPreviewSegmentCount: getAimPreviewSegments().length,
      aimPreviewLength: Math.round(getAimPreviewSegments().reduce(
        (total, segment) => total + Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y),
        0,
      )),
    }),
  };

  resetGame();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(frame);
})();
