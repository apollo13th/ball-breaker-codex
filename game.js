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

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const BASE_PADDLE_WIDTH = 92;
  const BASE_BALL_RADIUS = 8;
  const EFFECT_DURATION = 15000;
  const POWERUP_TYPES = ["grow", "shield", "big"];
  const POWERUP_CONFIG = {
    grow: { label: "Wide Paddle", letter: "G", color: "#7ee2ff" },
    shield: { label: "Shield Ready", letter: "S", color: "#bf8cff" },
    big: { label: "Big Ball", letter: "B", color: "#ffe56b" },
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
  let nextDropType = 0;
  let keys = { left: false, right: false };
  let activeEffects = { growUntil: 0, bigUntil: 0, shield: false };
  let powerups = [];
  let particles = [];
  let brickShards = [];

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
  };

  let bricks = [];

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
        bricks.push({
          x: sidePadding + column * (brickWidth + gap),
          y: top + row * 31,
          width: brickWidth,
          height: 21,
          color: palette[row],
          alive: true,
          points: (rows - row) * 20,
        });
      }
    }
  }

  function resetBall(direction = 1) {
    ball.radius = activeEffects.bigUntil > performance.now() ? 14 : BASE_BALL_RADIUS;
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddle.y - ball.radius - 3;
    ball.vx = direction * (230 + level * 18);
    ball.vy = -(350 + level * 22);
    ball.launched = false;
  }

  function resetGame() {
    score = 0;
    lives = 3;
    level = 1;
    combo = 0;
    nextDropType = 0;
    powerups = [];
    particles = [];
    brickShards = [];
    activeEffects = { growUntil: 0, bigUntil: 0, shield: false };
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
    if (window.matchMedia("(max-width: 700px)").matches) {
      requestAnimationFrame(() => gameFrame.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
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
      ball.launched = true;
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
    paddle.width = activeEffects.growUntil > now ? 154 : BASE_PADDLE_WIDTH;
    if (paddle.width !== previousWidth) {
      paddle.x = clamp(paddle.x - (paddle.width - previousWidth) / 2, 0, WIDTH - paddle.width);
    }

    ball.radius = activeEffects.bigUntil > now ? 14 : BASE_BALL_RADIUS;
  }

  function updateBall(deltaSeconds) {
    if (!ball.launched) {
      ball.x = paddle.x + paddle.width / 2;
      ball.y = paddle.y - ball.radius - 3;
      return;
    }

    ball.x += ball.vx * deltaSeconds;
    ball.y += ball.vy * deltaSeconds;

    if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= WIDTH) {
      ball.x = clamp(ball.x, ball.radius, WIDTH - ball.radius);
      ball.vx *= -1;
      playTone(170, 0.04);
    }

    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      playTone(190, 0.04);
    }

    if (
      ball.vy > 0 &&
      ball.y + ball.radius >= paddle.y &&
      ball.y - ball.radius <= paddle.y + paddle.height &&
      ball.x >= paddle.x - ball.radius &&
      ball.x <= paddle.x + paddle.width + ball.radius
    ) {
      const hitPosition = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.035, 720);
      ball.vx = speed * hitPosition * 0.86;
      ball.vy = -Math.sqrt(Math.max(speed * speed - ball.vx * ball.vx, 170 * 170));
      ball.y = paddle.y - ball.radius - 1;
      combo = 0;
      burst(ball.x, ball.y, "#7ee2ff", 7);
      playTone(260, 0.045);
    }

    checkBrickCollision();

    if (ball.y - ball.radius > HEIGHT) {
      handleMiss();
    }
  }

  function checkBrickCollision() {
    for (const brick of bricks) {
      if (!brick.alive || !circleHitsRect(ball, brick)) {
        continue;
      }

      brick.alive = false;
      combo += 1;
      score += brick.points + combo * 5;
      reflectBallFromBrick(brick);
      burst(ball.x, ball.y, brick.color, 12);
      shatterBrick(brick);
      playTone(340 + combo * 14, 0.05, "square");

      if ((score + brick.points + combo) % 4 === 0 || Math.random() < 0.19) {
        spawnPowerup(brick);
      }

      if (bricks.every((candidate) => !candidate.alive)) {
        completeWave();
      }
      return;
    }
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

  function completeWave() {
    score += 1000 * level;
    level += 1;
    playTone(660, 0.18, "triangle");
    if (level > 3) {
      state = "won";
      showOverlay("GRID CLEARED", "You broke the system.", `Final score: ${score.toLocaleString()}`, "Play Again");
      ball.launched = false;
      return;
    }

    createBricks();
    resetBall(level % 2 ? 1 : -1);
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
    const type = POWERUP_TYPES[nextDropType % POWERUP_TYPES.length];
    nextDropType += 1;
    powerups.push({
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height / 2,
      radius: 14,
      vy: 156,
      type,
    });
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
    } else if (type === "big") {
      activeEffects.bigUntil = now + EFFECT_DURATION;
    } else if (type === "shield") {
      activeEffects.shield = true;
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
    for (const brick of bricks) {
      if (!brick.alive) {
        continue;
      }
      ctx.fillStyle = brick.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(brick.x + 3, brick.y + 3, brick.width - 6, 2);
      ctx.strokeStyle = brick.color;
      ctx.strokeRect(brick.x - 1, brick.y - 1, brick.width + 2, brick.height + 2);
    }
  }

  function drawPaddle() {
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#7ee2ff";
    ctx.fillStyle = "#d1f8ff";
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.fillStyle = "#7ee2ff";
    ctx.fillRect(paddle.x + 6, paddle.y + 4, paddle.width - 12, 3);
    ctx.shadowBlur = 0;
  }

  function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = ball.radius * 2.2;
    ctx.shadowColor = activeEffects.bigUntil > performance.now() ? "#ffe56b" : "#7ee2ff";
    ctx.fill();
    ctx.shadowBlur = 0;
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

  function drawLaunchPrompt() {
    if (ball.launched || state !== "playing") {
      return;
    }
    ctx.fillStyle = "rgba(209, 248, 255, 0.8)";
    ctx.font = "700 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PRESS SPACE OR TAP TO LAUNCH", WIDTH / 2, HEIGHT - 92);
    ctx.textAlign = "start";
  }

  function render() {
    drawBackground();
    drawBricks();
    drawShield();
    drawPaddle();
    drawBall();
    drawPowerups();
    drawParticles();
    drawLaunchPrompt();
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

  startButton.addEventListener("click", startGame);
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
    movePaddleTo(event.clientX);
  });

  canvas.addEventListener("pointerdown", (event) => {
    movePaddleTo(event.clientX);
    if (state === "playing") {
      launchBall();
    }
  });

  window.__ballBreaker = {
    activatePowerup,
    simulateMiss: handleMiss,
    simulateBrickBreak: () => {
      const brick = bricks.find((candidate) => candidate.alive);
      if (brick) {
        brick.alive = false;
        shatterBrick(brick);
      }
    },
    getSnapshot: () => ({
      state,
      score,
      lives,
      level,
      bricksRemaining: bricks.filter((brick) => brick.alive).length,
      shieldReady: activeEffects.shield,
      paddleWidth: paddle.width,
      ballRadius: ball.radius,
      ballLaunched: ball.launched,
      brickShardCount: brickShards.length,
    }),
  };

  resetGame();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(frame);
})();
