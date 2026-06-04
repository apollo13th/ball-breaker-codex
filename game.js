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
  const NORMAL_BALL_SPEED = 430;
  const TINY_BALL_SPEED = NORMAL_BALL_SPEED * 1.5;
  const EFFECT_DURATION = 15000;
  const SHORT_EFFECT_DURATION = 10000;
  const NARROW_EFFECT_DURATION = 8000;
  const POWERUP_TYPES = ["grow", "shield", "big", "sticky", "ghost", "tiny", "narrow"];
  const POWERUP_CONFIG = {
    grow: { label: "Wide Paddle", letter: "G", color: "#9be8ff" },
    shield: { label: "Bear Shield", letter: "S", color: "#d5b4ff" },
    big: { label: "Big Ball", letter: "B", color: "#ffe89d" },
    sticky: { label: "Directional Shot", letter: "K", color: "#ffc6a4" },
    ghost: { label: "Phase Ball", letter: "P", color: "#a2ffe5" },
    tiny: { label: "Tiny Ball", letter: "T", color: "#ffc2ad" },
    narrow: { label: "Narrow Paddle", letter: "N", color: "#ff9ac4" },
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
  let ballTrail = [];
  let ballPulse = { x: 1, y: 1, life: 0 };
  let floatingTexts = [];
  let waveBanner = null;
  let bearMood = { type: "idle", life: 0, strength: 0 };
  let paddlePointer = null;
  let shakeTime = 0;
  let shakeAmount = 0;
  let stickyAim = null;

  const paddle = {
    x: WIDTH / 2 - BASE_PADDLE_WIDTH / 2,
    y: HEIGHT - 56,
    width: BASE_PADDLE_WIDTH,
    height: 13,
    speed: 430,
    targetX: WIDTH / 2 - BASE_PADDLE_WIDTH / 2,
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
    const palette = [
      { base: "#91d7f4", top: "#d9f7ff", edge: "#6eb8d8", glow: "#abedff" },
      { base: "#98c8ef", top: "#def2ff", edge: "#79acda", glow: "#b5ddff" },
      { base: "#b5b0f4", top: "#ece9ff", edge: "#918ce0", glow: "#d1cbff" },
      { base: "#d4afea", top: "#f6e4ff", edge: "#b48ad6", glow: "#e7c6ff" },
      { base: "#f1b0d6", top: "#ffe4f3", edge: "#d98bb8", glow: "#ffcbe8" },
      { base: "#f1dd94", top: "#fff2c8", edge: "#d2be6d", glow: "#ffeeb2" },
      { base: "#efc0a4", top: "#ffe4d6", edge: "#d79a76", glow: "#ffd5bc" },
    ];
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
          color: palette[row].base,
          topColor: palette[row].top,
          edgeColor: palette[row].edge,
          glowColor: palette[row].glow,
          alive: true,
          row,
          column,
          bomb: level > 1 && Math.random() < Math.min(0.08 + level * 0.012, 0.2),
          hp: maxHp,
          maxHp,
          points: (rows - row) * 20,
          flash: 0,
        });
      }
    }
  }

  function resetBall(direction = 1) {
    const now = performance.now();
    ball.radius = activeEffects.bigUntil > now ? 14 : activeEffects.tinyUntil > now ? 4 : BASE_BALL_RADIUS;
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddle.y - ball.radius - 3;
    const speed = getTargetBallSpeed(now);
    ball.vx = direction * speed * 0.48;
    ball.vy = -Math.sqrt(Math.max(speed * speed - ball.vx * ball.vx, 170 * 170));
    ball.launched = false;
    ball.stuck = false;
    ball.stuckOffset = 0;
    ball.lastBrickId = null;
    ballTrail = [];
    ballPulse = { x: 1, y: 1, life: 0 };
    stickyAim = null;
  }

  function clampPaddleX(x) {
    return clamp(x, 0, WIDTH - paddle.width);
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
    ballTrail = [];
    ballPulse = { x: 1, y: 1, life: 0 };
    floatingTexts = [];
    waveBanner = null;
    bearMood = { type: "idle", life: 0, strength: 0 };
    activeEffects = createEmptyEffects();
    shakeTime = 0;
    shakeAmount = 0;
    paddlePointer = null;
    paddle.width = BASE_PADDLE_WIDTH;
    paddle.x = WIDTH / 2 - paddle.width / 2;
    paddle.targetX = paddle.x;
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
    bearReact("ready");
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
        const speed = getTargetBallSpeed();
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
    if (paddlePointer?.mode === "drag") {
      paddle.x = clampPaddleX(paddlePointer.nextX - paddlePointer.dragOffset);
      paddle.targetX = paddle.x;
    } else {
      let steer = 0;
      if (keys.left) {
        steer -= 1;
      }
      if (keys.right) {
        steer += 1;
      }
      if (steer !== 0) {
        paddle.targetX = clampPaddleX(paddle.targetX + steer * paddle.speed * deltaSeconds);
      }

      const delta = paddle.targetX - paddle.x;
      const maxStep = paddle.speed * deltaSeconds;
      if (Math.abs(delta) <= maxStep) {
        paddle.x = paddle.targetX;
      } else {
        paddle.x += Math.sign(delta) * maxStep;
      }
    }

    paddle.x = clampPaddleX(paddle.x);
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
      const centeredX = paddle.x - (paddle.width - previousWidth) / 2;
      paddle.x = clampPaddleX(centeredX);
      paddle.targetX = clampPaddleX(paddle.targetX - (paddle.width - previousWidth) / 2);
    }

    if (activeEffects.bigUntil > now) {
      ball.radius = 14;
    } else if (activeEffects.tinyUntil > now) {
      ball.radius = 4;
    } else {
      ball.radius = BASE_BALL_RADIUS;
    }
  }

  function getTargetBallSpeed(now = performance.now()) {
    return activeEffects.tinyUntil > now ? TINY_BALL_SPEED : NORMAL_BALL_SPEED;
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
      normalizeBallSpeed();
      ball.lastBrickId = null;
      triggerBallPulse(1.15, 0.88);
      playTone(170, 0.04);
    }

    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      normalizeBallSpeed();
      activeEffects.ghostUntil = 0;
      ball.lastBrickId = null;
      triggerBallPulse(0.88, 1.15);
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
      burst(ball.x, ball.y, "#9be8ff", 7);
      if (activeEffects.sticky) {
        ball.launched = false;
        ball.stuck = true;
        ball.stuckOffset = ball.x - paddle.x;
        stickyAim = { x: ball.x, y: ball.y - 170 };
        playTone(380, 0.08, "triangle");
        return;
      }

      const hitPosition = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const speed = getTargetBallSpeed();
      ball.vx = speed * hitPosition * 0.86;
      ball.vy = -Math.sqrt(Math.max(speed * speed - ball.vx * ball.vx, 170 * 170));
      triggerBallPulse(1.2, 0.82);
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
        normalizeBallSpeed();
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
    brick.flash = 0.95;
    burst(ball.x, ball.y, brick.color, brick.hp <= 0 ? 12 : 6);
    playTone(340 + combo * 14, 0.05, "square");
    if (brick.hp > 0) {
      triggerBallPulse(1.12, 0.9);
      bearReact("blink");
      triggerShake(0.08, 2);
      return;
    }

    brick.alive = false;
    combo += 1;
    const gained = brick.points * brick.maxHp + combo * 5;
    score += gained;
    addFloatingText(`+${gained}`, brick.x + brick.width / 2, brick.y + brick.height / 2, brick.glowColor);
    if (combo >= 3) {
      addFloatingText(`x${combo}`, brick.x + brick.width / 2, brick.y - 4, "#ffe89d");
    }
    shatterBrick(brick);
    bearReact(combo >= 4 ? "combo" : "hit");
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
    bearReact("blast");
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

  function normalizeBallSpeed() {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (!speed) {
      return;
    }
    const targetSpeed = getTargetBallSpeed();
    ball.vx = (ball.vx / speed) * targetSpeed;
    ball.vy = (ball.vy / speed) * targetSpeed;
  }

  function completeWave() {
    score += 1000 * level;
    level += 1;
    playTone(660, 0.18, "triangle");
    createBricks();
    resetBall(level % 2 ? 1 : -1);
    waveBanner = { text: `WAVE ${String(level).padStart(2, "0")}`, life: 1.8 };
    bearReact("wave");
    updateHud();
  }

  function handleMiss() {
    if (activeEffects.shield) {
      activeEffects.shield = false;
      ball.y = HEIGHT - 20 - ball.radius;
      ball.vy = -Math.abs(ball.vy);
      triggerBallPulse(0.82, 1.2);
      burst(ball.x, HEIGHT - 17, "#d5b4ff", 24);
      addFloatingText("SAVED", ball.x, HEIGHT - 42, "#d5b4ff");
      bearReact("shield");
      playTone(560, 0.16, "sawtooth");
      updateHud();
      return;
    }

    lives -= 1;
    combo = 0;
    activeEffects = createEmptyEffects();
    powerups = [];
    bearReact("pout");
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
      bearReact("happy");
    } else if (type === "big") {
      activeEffects.bigUntil = now + EFFECT_DURATION;
      activeEffects.tinyUntil = 0;
      bearReact("happy");
    } else if (type === "shield") {
      activeEffects.shield = true;
      bearReact("shield");
    } else if (type === "sticky") {
      activeEffects.sticky = true;
      bearReact("happy");
    } else if (type === "ghost") {
      activeEffects.ghostUntil = now + SHORT_EFFECT_DURATION;
      bearReact("happy");
    } else if (type === "tiny") {
      activeEffects.tinyUntil = now + SHORT_EFFECT_DURATION;
      activeEffects.bigUntil = 0;
      bearReact("happy");
    } else if (type === "narrow") {
      activeEffects.narrowUntil = now + NARROW_EFFECT_DURATION;
      activeEffects.growUntil = 0;
      bearReact("pout");
    }
    burst(paddle.x + paddle.width / 2, paddle.y, POWERUP_CONFIG[type].color, 18);
    playTone(type === "shield" ? 540 : 460, 0.13, "triangle");
    updateEffects(now);
    if (ball.launched && (type === "big" || type === "tiny")) {
      normalizeBallSpeed();
    }
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

    for (const trail of ballTrail) {
      trail.life -= deltaSeconds;
    }
    ballTrail = ballTrail.filter((trail) => trail.life > 0);

    for (const brick of bricks) {
      brick.flash = Math.max(0, (brick.flash || 0) - deltaSeconds * 3.2);
    }

    if (ballPulse.life > 0) {
      ballPulse.life = Math.max(0, ballPulse.life - deltaSeconds * 7.5);
    } else {
      ballPulse.x = 1;
      ballPulse.y = 1;
    }

    for (const floater of floatingTexts) {
      floater.y -= 34 * deltaSeconds;
      floater.life -= deltaSeconds;
    }
    floatingTexts = floatingTexts.filter((floater) => floater.life > 0);

    if (waveBanner) {
      waveBanner.life -= deltaSeconds;
      if (waveBanner.life <= 0) {
        waveBanner = null;
      }
    }

    bearMood.life = Math.max(0, bearMood.life - deltaSeconds * 1.35);
    bearMood.strength = Math.max(0, bearMood.strength - deltaSeconds * 0.95);

    shakeTime = Math.max(0, shakeTime - deltaSeconds);
  }

  function triggerBallPulse(xScale, yScale) {
    ballPulse.x = xScale;
    ballPulse.y = yScale;
    ballPulse.life = 1;
  }

  function addFloatingText(text, x, y, color) {
    floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 0.85,
    });
  }

  function bearReact(type) {
    const strengths = {
      idle: 0,
      ready: 0.5,
      blink: 0.42,
      tap: 0.45,
      hit: 0.72,
      combo: 1.1,
      happy: 0.98,
      shield: 0.92,
      blast: 1.15,
      wave: 1.05,
      pout: 0.82,
      sad: 0.8,
    };
    bearMood = {
      type,
      life: 1,
      strength: strengths[type] ?? 0.7,
    };
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
      chips.push('<span class="power-chip shield">Bear shield 1 hit</span>');
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
      chips.push(`<span class="power-chip tiny">Tiny ball ${secondsLeft(activeEffects.tinyUntil, now)}s 1.5x</span>`);
    }
    if (activeEffects.narrowUntil > now) {
      chips.push(`<span class="power-chip narrow">Narrow ${secondsLeft(activeEffects.narrowUntil, now)}s</span>`);
    }
    powerupElement.innerHTML = chips.join("") || '<span class="empty-power">No boosts active</span>';
  }

  function secondsLeft(until, now) {
    return Math.max(1, Math.ceil((until - now) / 1000));
  }

  function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawBackground() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    wash.addColorStop(0, "#1a1730");
    wash.addColorStop(0.42, "#152238");
    wash.addColorStop(1, "#0a1520");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const bloomLeft = ctx.createRadialGradient(WIDTH * 0.22, HEIGHT * 0.08, 10, WIDTH * 0.22, HEIGHT * 0.08, WIDTH * 0.72);
    bloomLeft.addColorStop(0, "rgba(255, 184, 223, 0.28)");
    bloomLeft.addColorStop(0.5, "rgba(173, 219, 255, 0.1)");
    bloomLeft.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloomLeft;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const bloomRight = ctx.createRadialGradient(WIDTH * 0.82, HEIGHT * 0.2, 16, WIDTH * 0.82, HEIGHT * 0.2, WIDTH * 0.56);
    bloomRight.addColorStop(0, "rgba(212, 180, 255, 0.24)");
    bloomRight.addColorStop(0.55, "rgba(155, 232, 255, 0.08)");
    bloomRight.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloomRight;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawNeonBearBackdrop();

    const lowerGlow = ctx.createLinearGradient(0, HEIGHT * 0.72, 0, HEIGHT);
    lowerGlow.addColorStop(0, "rgba(255, 255, 255, 0)");
    lowerGlow.addColorStop(1, "rgba(181, 222, 255, 0.08)");
    ctx.fillStyle = lowerGlow;
    ctx.fillRect(0, HEIGHT * 0.72, WIDTH, HEIGHT * 0.28);

    ctx.strokeStyle = "rgba(185, 229, 255, 0.06)";
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

    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.48, HEIGHT * 0.16, WIDTH / 2, HEIGHT * 0.48, HEIGHT * 0.72);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(7, 12, 20, 0.36)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawNeonBearBackdrop() {
    const moodIntensity = bearMood.life;
    const reactionStrength = bearMood.strength;
    const moodColor = getBearMoodColor();
    const idleDrift = Math.sin(performance.now() / 820) * 7;
    const pulse = 1 + Math.sin(performance.now() / 135) * 0.015;
    const bears = [
      { x: WIDTH * 0.2, y: HEIGHT * 0.18, scale: 0.5, color: "rgba(255, 184, 223, 0.1)" },
      { x: WIDTH * 0.8, y: HEIGHT * 0.2, scale: 0.58, color: "rgba(173, 219, 255, 0.1)" },
    ];

    for (const bear of bears) {
      drawNeonBear(bear.x, bear.y, bear.scale, bear.color, "idle", 0.08);
    }

    const centerX = WIDTH / 2;
    const centerY = HEIGHT * 0.56 + idleDrift;
    const mainColor = moodIntensity > 0 ? moodColor : "rgba(212, 180, 255, 0.14)";
    const glow = ctx.createRadialGradient(centerX, centerY - HEIGHT * 0.03, 12, centerX, centerY, WIDTH * 0.46);
    glow.addColorStop(0, moodIntensity > 0 ? moodColor.replace(/0\.\d+\)/, "0.18)") : "rgba(212, 180, 255, 0.13)");
    glow.addColorStop(0.4, "rgba(173, 219, 255, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawNeonBear(centerX, centerY, 1.84 * pulse, mainColor, bearMood.type, Math.max(moodIntensity, reactionStrength));
    drawBearReactionAccents(centerX, centerY, reactionStrength);
  }

  function getBearMoodColor() {
    if (bearMood.type === "sad" || bearMood.type === "pout") {
      return "rgba(159, 212, 255, 0.28)";
    }
    if (bearMood.type === "shield") {
      return "rgba(213, 180, 255, 0.3)";
    }
    if (bearMood.type === "blast") {
      return "rgba(255, 183, 120, 0.36)";
    }
    if (bearMood.type === "combo" || bearMood.type === "wave") {
      return "rgba(255, 232, 157, 0.34)";
    }
    if (bearMood.type === "happy") {
      return "rgba(255, 191, 229, 0.34)";
    }
    if (bearMood.type === "hit" || bearMood.type === "tap" || bearMood.type === "blink") {
      return "rgba(255, 193, 218, 0.29)";
    }
    return "rgba(255, 184, 223, 0.26)";
  }

  function drawNeonBear(x, y, scale, color, mood = "idle", intensity = 0) {
    const faceWidth = 104 * scale;
    const faceHeight = 90 * scale;
    const earRadius = 21 * scale;
    const cheekRadius = 8.5 * scale;
    const eyeHeight = (7.4 + intensity * 1.8) * scale;
    const eyeWidth = (5.2 + intensity * 1.3) * scale;
    const faceGlow = Math.min(0.1, 0.045 + intensity * 0.04);
    const bob = intensity > 0 ? Math.sin(performance.now() / 120) * intensity * 2.4 : 0;
    const innerEar = "rgba(255, 209, 234, 0.18)";
    const cheekFill = "rgba(255, 186, 220, 0.12)";
    const noseFill = "rgba(255, 225, 240, 0.22)";
    const earLiftLeft = mood === "happy" || mood === "combo" || mood === "wave" ? -3.8 * scale : mood === "pout" || mood === "sad" ? 2.8 * scale : 0;
    const earLiftRight = mood === "happy" || mood === "combo" || mood === "wave" ? -2.6 * scale : mood === "pout" || mood === "sad" ? 3.4 * scale : 0;
    const cheekPulse = mood === "happy" ? 0.82 : mood === "combo" ? 0.7 : mood === "pout" ? 0.34 : 0.5;

    ctx.save();
    ctx.translate(0, -bob);
    ctx.strokeStyle = color;
    ctx.shadowColor = color.replace(/0\.\d+\)/, "0.34)");
    ctx.shadowBlur = (16 + intensity * 18) * scale;
    ctx.lineWidth = 2.2 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.fillStyle = `rgba(255, 255, 255, ${faceGlow})`;
    ctx.beginPath();
    ctx.arc(x - faceWidth * 0.28, y - faceHeight * 0.47 + earLiftLeft, earRadius, 0, Math.PI * 2);
    ctx.arc(x + faceWidth * 0.28, y - faceHeight * 0.47 + earLiftRight, earRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = innerEar;
    ctx.beginPath();
    ctx.arc(x - faceWidth * 0.28, y - faceHeight * 0.47 + earLiftLeft, earRadius * 0.56, 0, Math.PI * 2);
    ctx.arc(x + faceWidth * 0.28, y - faceHeight * 0.47 + earLiftRight, earRadius * 0.56, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${faceGlow})`;
    ctx.beginPath();
    ctx.ellipse(x, y, faceWidth * 0.5, faceHeight * 0.54, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x - faceWidth * 0.28, y - faceHeight * 0.47 + earLiftLeft, earRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + faceWidth * 0.28, y - faceHeight * 0.47 + earLiftRight, earRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x, y, faceWidth * 0.5, faceHeight * 0.54, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (mood === "sad" || mood === "pout") {
      ctx.beginPath();
      ctx.moveTo(x - faceWidth * 0.2, y - faceHeight * 0.055);
      ctx.lineTo(x - faceWidth * 0.1, y - faceHeight * 0.005);
      ctx.moveTo(x + faceWidth * 0.2, y - faceHeight * 0.055);
      ctx.lineTo(x + faceWidth * 0.1, y - faceHeight * 0.005);
      ctx.stroke();
    } else {
      if (mood === "happy") {
        ctx.beginPath();
        ctx.arc(x - faceWidth * 0.17, y - faceHeight * 0.055, eyeWidth * 1.28, Math.PI * 0.12, Math.PI * 0.88);
        ctx.arc(x + faceWidth * 0.17, y - faceHeight * 0.055, eyeWidth * 1.28, Math.PI * 0.12, Math.PI * 0.88);
        ctx.moveTo(x - faceWidth * 0.23, y - faceHeight * 0.06);
        ctx.lineTo(x - faceWidth * 0.2, y - faceHeight * 0.09);
        ctx.moveTo(x + faceWidth * 0.2, y - faceHeight * 0.09);
        ctx.lineTo(x + faceWidth * 0.23, y - faceHeight * 0.06);
        ctx.stroke();
      } else if (mood === "combo" || mood === "wave") {
        ctx.beginPath();
        drawStarEye(x - faceWidth * 0.17, y - faceHeight * 0.035, 5.7 * scale);
        drawStarEye(x + faceWidth * 0.17, y - faceHeight * 0.035, 5.7 * scale);
        ctx.stroke();
      } else if (mood === "shield") {
        ctx.beginPath();
        ctx.moveTo(x - faceWidth * 0.22, y - faceHeight * 0.07);
        ctx.lineTo(x - faceWidth * 0.12, y - faceHeight * 0.11);
        ctx.moveTo(x + faceWidth * 0.12, y - faceHeight * 0.11);
        ctx.lineTo(x + faceWidth * 0.22, y - faceHeight * 0.07);
        ctx.moveTo(x - faceWidth * 0.2, y - faceHeight * 0.015);
        ctx.lineTo(x - faceWidth * 0.1, y - faceHeight * 0.045);
        ctx.moveTo(x + faceWidth * 0.1, y - faceHeight * 0.045);
        ctx.lineTo(x + faceWidth * 0.2, y - faceHeight * 0.015);
        ctx.stroke();
      } else if (mood === "blink" || mood === "tap") {
        ctx.beginPath();
        ctx.moveTo(x - faceWidth * 0.22, y - faceHeight * 0.03);
        ctx.lineTo(x - faceWidth * 0.12, y - faceHeight * 0.03);
        ctx.moveTo(x + faceWidth * 0.12, y - faceHeight * 0.03);
        ctx.lineTo(x + faceWidth * 0.22, y - faceHeight * 0.03);
        ctx.stroke();
      } else if (mood === "blast") {
        ctx.beginPath();
        ctx.moveTo(x - faceWidth * 0.2, y - faceHeight * 0.1);
        ctx.lineTo(x - faceWidth * 0.12, y - faceHeight * 0.01);
        ctx.moveTo(x - faceWidth * 0.12, y - faceHeight * 0.1);
        ctx.lineTo(x - faceWidth * 0.2, y - faceHeight * 0.01);
        ctx.moveTo(x + faceWidth * 0.12, y - faceHeight * 0.1);
        ctx.lineTo(x + faceWidth * 0.2, y - faceHeight * 0.01);
        ctx.moveTo(x + faceWidth * 0.2, y - faceHeight * 0.1);
        ctx.lineTo(x + faceWidth * 0.12, y - faceHeight * 0.01);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(x - faceWidth * 0.17, y - faceHeight * 0.03, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
        ctx.ellipse(x + faceWidth * 0.17, y - faceHeight * 0.03, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(/0\.\d+\)/, "0.22)");
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 244, 250, 0.68)";
        ctx.lineWidth = 1.25 * scale;
        ctx.beginPath();
        ctx.arc(x - faceWidth * 0.19, y - faceHeight * 0.08, 1.7 * scale, 0, Math.PI * 2);
        ctx.arc(x + faceWidth * 0.15, y - faceHeight * 0.08, 1.7 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2 * scale;
      }
    }

    ctx.beginPath();
    ctx.ellipse(x, y + faceHeight * 0.06, 9.5 * scale, 7.8 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = noseFill;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x - faceWidth * 0.24, y + faceHeight * 0.07, cheekRadius, 0, Math.PI * 2);
    ctx.arc(x + faceWidth * 0.24, y + faceHeight * 0.07, cheekRadius, 0, Math.PI * 2);
    ctx.fillStyle = cheekFill;
    ctx.globalAlpha = cheekPulse + intensity * 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (mood === "sad" || mood === "pout") {
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.22, mood === "pout" ? 10.2 * scale : 8.5 * scale, Math.PI * 1.12, Math.PI * 1.88, true);
      ctx.stroke();
    } else if (mood === "happy") {
      ctx.fillStyle = "rgba(255, 210, 230, 0.18)";
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.205, 11.8 * scale, Math.PI * 0.1, Math.PI * 0.9);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.185, 11.8 * scale, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.22, 4.3 * scale, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    } else if (mood === "combo" || mood === "wave") {
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.18, 11.4 * scale, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    } else if (mood === "blast") {
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.2, 8.5 * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mood === "shield") {
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.16, 8.2 * scale, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y + faceHeight * 0.16, 7.6 * scale, Math.PI * 0.16, Math.PI * 0.84);
      ctx.stroke();
    }

    if (mood === "happy" || mood === "combo" || mood === "wave") {
      ctx.beginPath();
      ctx.moveTo(x - faceWidth * 0.055, y + faceHeight * 0.17);
      ctx.lineTo(x, y + faceHeight * 0.21 + intensity * 3.5 * scale);
      ctx.lineTo(x + faceWidth * 0.055, y + faceHeight * 0.17);
      ctx.stroke();
    }

    if (intensity > 0) {
      ctx.globalAlpha = Math.min(0.24, intensity * 0.24);
      ctx.beginPath();
      ctx.arc(x, y, (faceWidth * 0.68) + intensity * 16 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBearReactionAccents(x, y, intensity) {
    if (intensity <= 0.04) {
      return;
    }

    const orbitY = y - 8;
    const time = performance.now();
    const accentColor = getBearMoodColor();
    const radius = 104 + intensity * 18;
    const sparkCount = bearMood.type === "combo" || bearMood.type === "wave" ? 8 : 5;

    ctx.save();
    ctx.strokeStyle = accentColor;
    ctx.fillStyle = accentColor;
    ctx.lineWidth = 1.8;
    ctx.shadowBlur = 12;
    ctx.shadowColor = accentColor;
    ctx.globalAlpha = Math.min(0.8, 0.22 + intensity * 0.32);

    for (let index = 0; index < sparkCount; index += 1) {
      const angle = (Math.PI * 2 * index) / sparkCount + time / 560;
      const sx = x + Math.cos(angle) * radius;
      const sy = orbitY + Math.sin(angle) * radius * 0.54;
      if (bearMood.type === "happy") {
        drawHeart(sx, sy, 0.58 + intensity * 0.12);
        ctx.fill();
      } else if (bearMood.type === "shield") {
        ctx.beginPath();
        ctx.arc(sx, sy, 3 + intensity * 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (bearMood.type === "wave" || bearMood.type === "combo") {
        ctx.beginPath();
        drawStarEye(sx, sy, 5 + intensity * 1.2);
        ctx.stroke();
      } else if (bearMood.type === "blast") {
        ctx.beginPath();
        for (let point = 0; point < 8; point += 1) {
          const pointAngle = (Math.PI * 2 * point) / 8;
          const spike = point % 2 === 0 ? 7 + intensity * 2 : 3 + intensity;
          const px = sx + Math.cos(pointAngle) * spike;
          const py = sy + Math.sin(pointAngle) * spike;
          if (point === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        ctx.fill();
      } else if (bearMood.type === "pout" || bearMood.type === "sad") {
        ctx.beginPath();
        ctx.moveTo(sx, sy - 2);
        ctx.bezierCurveTo(sx - 5, sy + 1, sx - 2, sy + 8, sx, sy + 9);
        ctx.bezierCurveTo(sx + 2, sy + 8, sx + 5, sy + 1, sx, sy - 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy);
        ctx.lineTo(sx + 6, sy);
        ctx.moveTo(sx, sy - 6);
        ctx.lineTo(sx, sy + 6);
        ctx.stroke();
      }
    }

    if (bearMood.type === "hit" || bearMood.type === "tap" || bearMood.type === "blink" || bearMood.type === "combo") {
      ctx.globalAlpha = Math.min(0.75, 0.18 + intensity * 0.32);
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * 2 * index) / 6 + time / 900;
        const inner = radius * 0.74;
        const outer = radius * (0.92 + intensity * 0.08);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * inner, orbitY + Math.sin(angle) * inner * 0.55);
        ctx.lineTo(x + Math.cos(angle) * outer, orbitY + Math.sin(angle) * outer * 0.55);
        ctx.stroke();
      }
    }

    if (bearMood.type === "shield") {
      ctx.globalAlpha = Math.min(0.7, 0.22 + intensity * 0.24);
      ctx.beginPath();
      ctx.arc(x, orbitY + 6, radius * 0.92, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawHeart(x, y, scale) {
    ctx.beginPath();
    ctx.moveTo(x, y + 7 * scale);
    ctx.bezierCurveTo(x - 11 * scale, y - 1 * scale, x - 10 * scale, y - 12 * scale, x, y - 4 * scale);
    ctx.bezierCurveTo(x + 10 * scale, y - 12 * scale, x + 11 * scale, y - 1 * scale, x, y + 7 * scale);
    ctx.closePath();
  }

  function drawStarEye(x, y, radius) {
    for (let point = 0; point < 8; point += 1) {
      const angle = (-Math.PI / 2) + (Math.PI * point) / 4;
      const spike = point % 2 === 0 ? radius : radius * 0.44;
      const px = x + Math.cos(angle) * spike;
      const py = y + Math.sin(angle) * spike;
      if (point === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
  }

  function drawBricks() {
    const bombPulse = 0.5 + Math.sin(performance.now() / 145) * 0.5;
    for (const brick of bricks) {
      if (!brick.alive) {
        continue;
      }
      const flash = brick.flash || 0;
      const x = brick.x;
      const y = brick.y;
      const width = brick.width;
      const height = brick.height;
      const fill = ctx.createLinearGradient(x, y, x, y + height);
      fill.addColorStop(0, brick.topColor);
      fill.addColorStop(0.28, brick.color);
      fill.addColorStop(1, brick.edgeColor);

      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.shadowBlur = 10 + flash * 16;
      ctx.shadowColor = brick.bomb ? "#ff9d7b" : brick.glowColor;
      ctx.beginPath();
      roundedRectPath(x, y, width, height, 6);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.32 + flash * 0.35;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      roundedRectPath(x + 3, y + 3, width - 6, 4, 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = flash > 0 ? "#fff8ff" : brick.glowColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      roundedRectPath(x + 0.5, y + 0.5, width - 1, height - 1, 6);
      ctx.stroke();
      ctx.strokeStyle = "rgba(33, 45, 68, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundedRectPath(x + 1.5, y + 1.5, width - 3, height - 3, 5);
      ctx.stroke();
      ctx.restore();

      if (brick.bomb) {
        ctx.save();
        ctx.globalAlpha = 0.22 + bombPulse * 0.12;
        ctx.fillStyle = "rgba(255, 164, 118, 0.18)";
        ctx.beginPath();
        roundedRectPath(x - 2, y - 2, width + 4, height + 4, 7);
        ctx.fill();
        ctx.restore();
      }

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

    ctx.strokeStyle = "rgba(66, 16, 13, 0.7)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(centerX - 2.1, centerY - 0.7, 0.85, 0, Math.PI * 2);
    ctx.arc(centerX + 2.1, centerY - 0.7, 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY + 2.2, 2.1, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.restore();
  }

  function drawPaddle() {
    const topColor = activeEffects.sticky ? "#fff4d6" : activeEffects.narrowUntil > performance.now() ? "#ffd1e3" : "#f3fdff";
    const baseColor = activeEffects.sticky ? "#ffc6a4" : activeEffects.narrowUntil > performance.now() ? "#ff9ec7" : "#9be8ff";
    const paddleFill = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
    paddleFill.addColorStop(0, topColor);
    paddleFill.addColorStop(0.55, baseColor);
    paddleFill.addColorStop(1, "rgba(122, 167, 214, 0.92)");

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = baseColor;
    ctx.beginPath();
    roundedRectPath(paddle.x, paddle.y, paddle.width, paddle.height, 6);
    ctx.fillStyle = paddleFill;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    roundedRectPath(paddle.x + 7, paddle.y + 3, paddle.width - 14, 3, 2);
    ctx.fill();
  }

  function drawBallTrail() {
    if (!ballTrail.length) {
      return;
    }

    const shadowColor = activeEffects.ghostUntil > performance.now()
      ? "#8fffe0"
      : activeEffects.bigUntil > performance.now()
        ? "#ffeaa8"
        : activeEffects.tinyUntil > performance.now()
          ? "#ffd0bf"
          : "#b9f0ff";

    ctx.save();
    for (let index = ballTrail.length - 1; index >= 0; index -= 1) {
      const trail = ballTrail[index];
      const alpha = Math.min(0.2, trail.life * 0.22) * ((ballTrail.length - index) / ballTrail.length);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = trail.color;
      ctx.shadowBlur = trail.radius * 1.8;
      ctx.shadowColor = shadowColor;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, trail.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBall() {
    drawBallTrail();
    const stretch = ballPulse.life > 0 ? ballPulse.life : 0;
    const scaleX = 1 + (ballPulse.x - 1) * stretch;
    const scaleY = 1 + (ballPulse.y - 1) * stretch;
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.scale(scaleX, scaleY);
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.globalAlpha = activeEffects.ghostUntil > performance.now() ? 0.58 : 1;
    ctx.fillStyle = activeEffects.tinyUntil > performance.now() ? "#ffd0bf" : "#fffdfd";
    ctx.shadowBlur = ball.radius * 2.8;
    ctx.shadowColor = activeEffects.ghostUntil > performance.now()
      ? "#8fffe0"
      : activeEffects.bigUntil > performance.now()
        ? "#ffeaa8"
        : "#b9f0ff";
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.52)";
    ctx.beginPath();
    ctx.arc(-ball.radius * 0.26, -ball.radius * 0.28, Math.max(1.2, ball.radius * 0.28), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawShield() {
    if (!activeEffects.shield) {
      return;
    }
    const pulse = 0.55 + Math.sin(performance.now() / 170) * 0.45;
    const shieldY = HEIGHT - 17;
    const centerX = WIDTH / 2;
    const beam = ctx.createLinearGradient(0, shieldY, WIDTH, shieldY);
    beam.addColorStop(0, "rgba(0, 0, 0, 0)");
    beam.addColorStop(0.18, "rgba(191, 140, 255, 0.95)");
    beam.addColorStop(0.5, "rgba(247, 232, 255, 1)");
    beam.addColorStop(0.82, "rgba(191, 140, 255, 0.95)");
    beam.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.save();
    ctx.strokeStyle = beam;
    ctx.lineWidth = 4 + pulse * 2;
    ctx.shadowBlur = 12 + pulse * 18;
    ctx.shadowColor = "#d5b4ff";
    ctx.beginPath();
    ctx.moveTo(0, shieldY);
    ctx.lineTo(WIDTH, shieldY);
    ctx.stroke();

    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.42;
    for (let x = 12; x < WIDTH; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, shieldY - 6);
      ctx.lineTo(x + 10, shieldY + 6);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    for (let x = 18; x < WIDTH; x += 72) {
      ctx.fillStyle = "#f7e8ff";
      ctx.beginPath();
      ctx.arc(x, shieldY, 2.2 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#f7e8ff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(centerX - 13, shieldY - 8.5, 4.2, 0, Math.PI * 2);
    ctx.arc(centerX + 13, shieldY - 8.5, 4.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    roundedRectPath(centerX - 15, shieldY - 13, 30, 18, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX - 6.2, shieldY - 4, 1.1, 0, Math.PI * 2);
    ctx.arc(centerX + 6.2, shieldY - 4, 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, shieldY + 1.5, 5.3, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#d9b9ff";
    ctx.font = "700 12px monospace";
    ctx.fillText("BEAR SHIELD // ARMED", 14, HEIGHT - 27);
  }

  function drawPowerups() {
    for (const powerup of powerups) {
      const config = POWERUP_CONFIG[powerup.type];
      const fill = ctx.createLinearGradient(powerup.x, powerup.y - powerup.radius, powerup.x, powerup.y + powerup.radius);
      fill.addColorStop(0, "rgba(255, 255, 255, 0.22)");
      fill.addColorStop(0.2, "rgba(20, 25, 46, 0.96)");
      fill.addColorStop(1, "rgba(9, 14, 28, 0.96)");
      ctx.shadowBlur = 12;
      ctx.shadowColor = config.color;
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y, powerup.radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = config.color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.beginPath();
      ctx.arc(powerup.x - 3, powerup.y - 4, powerup.radius * 0.42, Math.PI * 1.05, Math.PI * 1.9);
      ctx.fill();
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

  function drawFeedback() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (waveBanner) {
      const alpha = Math.min(1, waveBanner.life);
      ctx.globalAlpha = alpha;
      ctx.font = "700 28px Impact, sans-serif";
      ctx.fillStyle = "rgba(255, 248, 255, 0.92)";
      ctx.shadowBlur = 22;
      ctx.shadowColor = "#d5b4ff";
      ctx.fillText(waveBanner.text, WIDTH / 2, HEIGHT * 0.46);
      ctx.font = "700 11px monospace";
      ctx.fillStyle = "rgba(155, 232, 255, 0.75)";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#9be8ff";
      ctx.fillText("PAWS UP", WIDTH / 2, HEIGHT * 0.46 + 30);
    }

    ctx.font = "700 13px monospace";
    for (const floater of floatingTexts) {
      ctx.globalAlpha = Math.min(1, floater.life * 1.4);
      ctx.fillStyle = floater.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawAimLine() {
    if (!ball.stuck || !stickyAim) {
      return;
    }
    const segments = getAimPreviewSegments();
    drawAimImpactHighlights(segments);
    ctx.fillStyle = "#ffad66";
    ctx.globalAlpha = 0.8;
    let carry = 0;
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
    for (const bounceSegment of segments.slice(0, -1)) {
      const bounce = bounceSegment.end;
      ctx.strokeStyle = bounceSegment.hitType === "brick" ? "#ffe7a8" : "#ffad66";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bounce.x, bounce.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (bounceSegment.hitType === "brick") {
        ctx.fillStyle = "#ffe7a8";
        ctx.beginPath();
        ctx.arc(bounce.x, bounce.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffad66";
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawAimImpactHighlights(segments) {
    const highlightedBricks = new Set();
    for (const segment of segments) {
      if (segment.hitType !== "brick" || !segment.hitBrick || highlightedBricks.has(segment.hitBrick.id)) {
        continue;
      }
      highlightedBricks.add(segment.hitBrick.id);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "rgba(255, 173, 102, 0.12)";
      ctx.fillRect(segment.hitBrick.x - 2, segment.hitBrick.y - 2, segment.hitBrick.width + 4, segment.hitBrick.height + 4);
      ctx.strokeStyle = "#ffe7a8";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#ffad66";
      ctx.strokeRect(segment.hitBrick.x - 2, segment.hitBrick.y - 2, segment.hitBrick.width + 4, segment.hitBrick.height + 4);
      ctx.restore();
    }
  }

  function getAimPreviewSegments() {
    if (!ball.stuck || !stickyAim) {
      return [];
    }
    const dx = stickyAim.x - ball.x;
    const dy = Math.min(stickyAim.y - ball.y, -20);
    const length = Math.hypot(dx, dy) || 1;
    const segments = [];
    let start = { x: ball.x, y: ball.y };
    let velocity = { x: dx / length, y: dy / length };

    for (let ricochet = 0; ricochet < 3; ricochet += 1) {
      const hit = traceAimPreviewCollision(start, velocity);
      segments.push({ start, end: hit.point, hitType: hit.type, hitBrick: hit.brick || null });
      velocity = reflectPreviewVelocity(velocity, hit.axis);
      start = {
        x: hit.point.x + velocity.x * 0.6,
        y: hit.point.y + velocity.y * 0.6,
      };
    }

    return segments;
  }

  function traceAimPreviewCollision(start, velocity) {
    const distances = [];
    if (velocity.x < 0) {
      distances.push({ distance: (ball.radius - start.x) / velocity.x, axis: "x", type: "wall" });
    } else if (velocity.x > 0) {
      distances.push({ distance: (WIDTH - ball.radius - start.x) / velocity.x, axis: "x", type: "wall" });
    }
    if (velocity.y < 0) {
      distances.push({ distance: (ball.radius - start.y) / velocity.y, axis: "y", type: "wall" });
    } else if (velocity.y > 0) {
      distances.push({ distance: (paddle.y - ball.radius - start.y) / velocity.y, axis: "y", type: "wall" });
    }

    for (const brick of bricks) {
      if (!brick.alive) {
        continue;
      }
      const hit = tracePreviewBrickCollision(start, velocity, brick);
      if (hit) {
        distances.push(hit);
      }
    }

    const hit = distances
      .filter((candidate) => candidate.distance > 0.01)
      .sort((a, b) => a.distance - b.distance)[0];

    return {
      axis: hit.axis,
      type: hit.type,
      brick: hit.brick || null,
      point: {
        x: start.x + velocity.x * hit.distance,
        y: start.y + velocity.y * hit.distance,
      },
    };
  }

  function tracePreviewBrickCollision(start, velocity, brick) {
    const minX = brick.x - ball.radius;
    const maxX = brick.x + brick.width + ball.radius;
    const minY = brick.y - ball.radius;
    const maxY = brick.y + brick.height + ball.radius;

    const xEntry = velocity.x === 0
      ? Number.NEGATIVE_INFINITY
      : ((velocity.x > 0 ? minX : maxX) - start.x) / velocity.x;
    const xExit = velocity.x === 0
      ? Number.POSITIVE_INFINITY
      : ((velocity.x > 0 ? maxX : minX) - start.x) / velocity.x;
    const yEntry = velocity.y === 0
      ? Number.NEGATIVE_INFINITY
      : ((velocity.y > 0 ? minY : maxY) - start.y) / velocity.y;
    const yExit = velocity.y === 0
      ? Number.POSITIVE_INFINITY
      : ((velocity.y > 0 ? maxY : minY) - start.y) / velocity.y;

    const entryTime = Math.max(xEntry, yEntry);
    const exitTime = Math.min(xExit, yExit);
    if (entryTime <= 0.01 || entryTime > exitTime) {
      return null;
    }

    let axis = "x";
    if (Math.abs(xEntry - yEntry) <= 0.0001) {
      axis = "xy";
    } else if (yEntry > xEntry) {
      axis = "y";
    }

    return {
      axis,
      distance: entryTime,
      type: "brick",
      brick,
    };
  }

  function reflectPreviewVelocity(velocity, axis) {
    return {
      x: axis === "x" || axis === "xy" ? -velocity.x : velocity.x,
      y: axis === "y" || axis === "xy" ? -velocity.y : velocity.y,
    };
  }

  function drawLaunchPrompt() {
    if (ball.launched || state !== "playing") {
      return;
    }
    ctx.fillStyle = "rgba(209, 248, 255, 0.8)";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      ball.stuck ? "AIM FOR TWO BOUNCES, THEN TAP PADDLE OR LAUNCH" : "PRESS SPACE OR TAP TO LAUNCH",
      WIDTH / 2,
      HEIGHT - 92
    );
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
    drawFeedback();
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
      updateBallTrail(deltaSeconds);
      updatePowerups(deltaSeconds, timestamp);
      updateParticles(deltaSeconds);
      updateHud(timestamp);
    } else if (!ball.launched) {
      ballTrail = [];
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

  function updateBallTrail(deltaSeconds) {
    if (!ball.launched) {
      ballTrail = [];
      return;
    }
    const travel = Math.hypot(ball.vx, ball.vy) * deltaSeconds;
    if (travel < 4) {
      return;
    }

    const color = activeEffects.ghostUntil > performance.now()
      ? "rgba(143, 255, 224, 0.8)"
      : activeEffects.bigUntil > performance.now()
        ? "rgba(255, 234, 168, 0.78)"
        : activeEffects.tinyUntil > performance.now()
          ? "rgba(255, 208, 191, 0.76)"
          : "rgba(185, 240, 255, 0.76)";

    ballTrail.unshift({
      x: ball.x,
      y: ball.y,
      radius: Math.max(1.8, ball.radius * 0.84),
      color,
      life: 0.22,
    });
    if (ballTrail.length > 8) {
      ballTrail.length = 8;
    }
  }

  function beginPaddlePointer(event, point) {
    const dragMode = pointNearPaddle(point) ? "drag" : "target";
    paddlePointer = {
      id: event.pointerId,
      mode: dragMode,
      dragOffset: point.x - paddle.x,
      nextX: point.x,
    };
    if (dragMode === "target") {
      paddlePointer.dragOffset = paddle.width / 2;
      paddlePointer.nextX = point.x;
      paddle.targetX = clampPaddleX(point.x - paddle.width / 2);
    } else {
      paddle.targetX = paddle.x;
    }
  }

  function updatePaddlePointer(event) {
    if (!paddlePointer || event.pointerId !== paddlePointer.id) {
      return;
    }
    const point = canvasPoint(event);
    paddlePointer.nextX = point.x;
    if (paddlePointer.mode === "target") {
      paddle.targetX = clampPaddleX(point.x - paddle.width / 2);
    }
  }

  function releasePaddlePointer(pointerId) {
    if (paddlePointer && paddlePointer.id === pointerId) {
      paddlePointer = null;
    }
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
    if (held) {
      paddlePointer = null;
    }
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
    if (paddlePointer) {
      updatePaddlePointer(event);
    }
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
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic or browser-managed pointers may not support capture here.
    }
    beginPaddlePointer(event, point);
    if (state === "playing") {
      launchBall();
    }
  });

  for (const eventName of ["pointerup", "pointercancel"]) {
    canvas.addEventListener(eventName, (event) => {
      releasePaddlePointer(event.pointerId);
    });
  }

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
    getSnapshot: () => {
      const aimSegments = getAimPreviewSegments();
      return {
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
        aimPreviewSegmentCount: aimSegments.length,
        aimPreviewLength: Math.round(aimSegments.reduce(
          (total, segment) => total + Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y),
          0,
        )),
        aimPreviewBrickHits: aimSegments.filter((segment) => segment.hitType === "brick").length,
      };
    },
  };

  resetGame();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(frame);
})();
