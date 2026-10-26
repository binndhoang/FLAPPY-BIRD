// ===== 1. THIẾT LẬP =====
var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");   // "bút vẽ" cho màn hình chính
var W = canvas.width;                // 360
var H = canvas.height;               // 640

// Vẽ ở độ phân giải cao (S lần) rồi thu về vừa khung, để ảnh Ronaldo và chữ luôn NÉT.
// Toạ độ trong game vẫn tính theo 360 x 640 như cũ.
var S = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
canvas.width = W * S;
canvas.height = H * S;
ctx.setTransform(S, 0, 0, S, 0, 0);

// --- Độ khó (thử đổi để xem game thay đổi thế nào) ---
var GRAVITY = 1500;      // lực kéo xuống
var FLAP = -420;         // vận tốc bay lên mỗi lần bấm (số âm = đi lên)
var PIPE_SPEED = 140;    // tốc độ cúp chạy sang trái
var GAP = 175;           // khe hở giữa cúp trên và cúp dưới
var SPAWN_EVERY = 1.6;   // cứ mấy giây có một cặp cúp mới
var PIPE_W = 64;         // bề rộng một cúp
var PIPE_INSET = 12;     // phần mép cúp được "tha" khi tính va chạm (cho dễ chơi)
var GROUND = 90;         // chiều cao sân cỏ
var PLAYER_X = 90;       // vị trí ngang cố định của Ronaldo
var RADIUS = 24;         // vùng va chạm của Ronaldo

// --- Phong cách pixel ---
var PX = 2;              // 1 "ô pixel" của phong cảnh = 2 điểm ảnh màn hình (tăng lên 3, 4 để pixel to hơn)
var PIXEL = 1;           // độ vỡ hạt của Ronaldo (1 = ảnh nét, 2 hoặc 3 = vỡ hạt pixel)
var BOX = 84;            // khung tối đa của Ronaldo (tăng lên nếu muốn to hơn)
var SIZE = 52;           // kích thước hình dự phòng khi chưa có ảnh
var LW = W / PX, LH = H / PX;      // kích thước "tấm vẽ nhỏ": 180 x 320
var GY = (H - GROUND) / PX;        // vị trí mặt sân trên tấm vẽ nhỏ

// Cách làm pixel: vẽ cả thế giới lên một tấm vẽ NHỎ (180x320), rồi phóng to gấp đôi,
// không làm mịn => mỗi điểm vẽ biến thành một ô vuông rõ nét.
var low = document.createElement("canvas");
low.width = LW; low.height = LH;
var L = low.getContext("2d");
var T = L;                        // tấm vẽ đang được dùng
ctx.imageSmoothingEnabled = false;
L.imageSmoothingEnabled = false;

// Bảng màu cúp vàng
var P = { D: "#3a2205", gold: "#f7c61f", light: "#ffeb85", gdark: "#c78a0b",
          green: "#12a85c", lgreen: "#52e590", dgreen: "#0a6b3b" };

// ===== 2. ẢNH RONALDO (đặt file ronaldo.png cùng thư mục) =====
var img = new Image();
img.src = "ronaldo.png";
var sprite = null;

// Thu nhỏ ảnh về dạng pixel, làm một lần khi ảnh tải xong
function buildSprite() {
  var s = Math.min(BOX / img.naturalWidth, BOX / img.naturalHeight);
  var w = Math.max(1, Math.round(img.naturalWidth * s));
  var h = Math.max(1, Math.round(img.naturalHeight * s));
  var res = (PIXEL === 1) ? S : 1 / PIXEL;       // PIXEL=1: giữ đủ chi tiết cho màn hình nét
  var tw = Math.max(1, Math.round(w * res)), th = Math.max(1, Math.round(h * res));
  var src = img, sw = img.naturalWidth, sh = img.naturalHeight;
  while (sw / 2 > tw && sh / 2 > th) {          // thu nhỏ từng nửa một cho ảnh đỡ rỗ
    var c1 = document.createElement("canvas");
    c1.width = Math.round(sw / 2); c1.height = Math.round(sh / 2);
    c1.getContext("2d").drawImage(src, 0, 0, c1.width, c1.height);
    src = c1; sw = c1.width; sh = c1.height;
  }
  var c = document.createElement("canvas");
  c.width = tw; c.height = th;
  c.getContext("2d").drawImage(src, 0, 0, tw, th);
  // Bản "bóng trắng" của Ronaldo, dùng để vẽ viền sáng cho dễ thấy trên nền khán giả
  var sil = document.createElement("canvas");
  sil.width = tw; sil.height = th;
  var sc = sil.getContext("2d");
  sc.drawImage(c, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#ffffff";
  sc.fillRect(0, 0, tw, th);
  sprite = { c: c, sil: sil, w: w, h: h, k: (PIXEL === 1 ? 1.5 : PIXEL) };   // k = độ dày viền trắng
}

// ===== 3. HÀM VẼ PIXEL =====
function R(x, y, w, h, color) {        // vẽ một hình chữ nhật trên tấm vẽ nhỏ
  T.fillStyle = color;
  T.fillRect(x, y, w, h);
}

function disc(rect, cx, cy, rad, color) {   // vẽ hình tròn bằng các vạch ngang
  for (var dy = -rad; dy <= rad; dy++) {
    var hw = Math.round(Math.sqrt(rad * rad - dy * dy + 0.25));
    rect(cx - hw, cy + dy, hw * 2 + 1, 1, color);
  }
}

function rng(seed) {                   // bộ số ngẫu nhiên cố định: khán giả luôn ngồi đúng chỗ
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ===== 4. PHONG CẢNH: SÂN VẬN ĐỘNG BỒ ĐÀO NHA (vẽ sẵn một lần) =====
function buildBG(phase) {              // phase 0/1 = hai tư thế của khán giả (nhảy lên/xuống)
  var c = document.createElement("canvas");
  c.width = LW; c.height = LH;
  T = c.getContext("2d");
  var r = rng(42), i, x, y;

  // Bầu trời hoàng hôn (các dải màu)
  var bands = [[0, "#1c1450"], [40, "#3b2a85"], [72, "#6a3a9a"], [98, "#b84a8a"], [116, "#ee7a5a"], [128, "#ffb25a"]];
  for (i = 0; i < bands.length; i++) {
    var y1 = i + 1 < bands.length ? bands[i + 1][0] : 144;
    R(0, bands[i][0], LW, y1 - bands[i][0], bands[i][1]);
  }
  for (i = 1; i < bands.length; i++) {          // viền lốm đốm giữa các dải màu
    for (x = 0; x < LW; x += 2) {
      R(x + (i % 2), bands[i][0] - 1, 1, 1, bands[i][1]);
      R(x + 1 - (i % 2), bands[i][0] - 3, 1, 1, bands[i][1]);
    }
  }
  for (i = 0; i < 28; i++) {                    // sao
    x = Math.floor(r() * LW); y = Math.floor(r() * 60);
    R(x, y, 1, 1, "#fff6c8");
    if (r() < 0.2) { R(x - 1, y, 3, 1, "#fff6c8"); R(x, y - 1, 1, 3, "#fff6c8"); }
  }
  disc(R, 150, 30, 7, "#ffe9a0");               // trăng khuyết
  disc(R, 153, 28, 6, "#1c1450");

  // Hai cột đèn pha
  [12, LW - 14].forEach(function (fx) {
    R(fx, 64, 3, 70, "#2b2850");
    R(fx - 7, 52, 17, 10, "#3a3868");
    for (var a = 0; a < 3; a++) for (var b = 0; b < 2; b++) R(fx - 6 + a * 5, 53 + b * 4, 4, 3, "#fff7b0");
    for (var gx = -12; gx <= 14; gx += 2) for (var gy = 44; gy <= 66; gy += 2) if ((gx + gy) % 4 === 0) R(fx + gx, gy, 1, 1, "#ffe9a0");
  });

  // Mái sân và cờ treo xanh - đỏ
  R(0, 126, LW, 12, "#1d1b3d");
  R(0, 138, LW, 3, "#34325e");
  for (x = 0, i = 0; x < LW; x += 6, i++) {
    var fc = i % 2 ? "#0a8a3a" : "#d8202a";
    R(x, 141, 5, 1, fc); R(x + 1, 142, 3, 1, fc); R(x + 2, 143, 1, 1, fc);
  }

  // Khán đài
  R(0, 144, LW, 111, "#242048");
  for (y = 150; y < 255; y += 8) R(0, y, LW, 1, "#33306a");
  var skins = ["#f2c29a", "#d9a066", "#a8683a", "#7a4a2a"];
  var hairs = ["#222222", "#5a3a1a", "#c9a227"];
  var shirts = ["#d8202a", "#d8202a", "#d8202a", "#0a8a3a", "#0a8a3a", "#f4f4f4", "#ffd400", "#2a5bd6"];
  for (var row = 0; row < 13; row++) {
    var y0 = 146 + row * 8;
    for (x = (row % 2) * 3; x < LW - 5; x += 6) {
      var skin = skins[Math.floor(r() * skins.length)];
      var hair = hairs[Math.floor(r() * hairs.length)];
      var shirt = shirts[Math.floor(r() * shirts.length)];
      var up = (phase === 1 && r() < 0.45) ? 1 : (r(), 0);   // người nào nhảy lên ở khung 2
      R(x + 1, y0 + 1 - up, 3, 3, skin);
      R(x + 1, y0 + 1 - up, 3, 1, hair);
      R(x, y0 + 4 - up, 5, 4 + up, shirt);
      if (up) { R(x - 1, y0 + 1, 1, 3, skin); R(x + 5, y0 + 1, 1, 3, skin); }   // giơ tay
    }
  }

  // Băng rôn cờ Bồ Đào Nha giữa khán đài
  var fx = 62, fy = 166;
  R(fx, 144, 1, fy - 144, "#999"); R(fx + 53, 144, 1, fy - 144, "#999");
  R(fx - 1, fy - 1, 56, 38, "#111");
  R(fx, fy, 22, 36, "#0a8a3a");
  R(fx + 22, fy, 32, 36, "#d8202a");
  disc(R, fx + 22, fy + 18, 7, "#ffd400");
  disc(R, fx + 22, fy + 18, 4, "#d8202a");
  R(fx + 20, fy + 16, 5, 5, "#ffffff");
  R(fx + 21, fy + 17, 3, 3, "#2a4fd6");

  // Biển quảng cáo quanh sân (chỉ là các khối màu, không có nhãn hiệu thật)
  var bc = ["#e63946", "#2a9d8f", "#f4a261", "#457b9d", "#ffd166", "#9b5de5"];
  R(0, 255, LW, 20, "#14142e");
  for (x = 0, i = 0; x < LW; x += 24, i++) {
    R(x, 257, 23, 14, bc[i % bc.length]);
    R(x, 257, 23, 2, "rgba(255,255,255,0.35)");
    R(x + 4, 262, 9, 2, "#ffffff"); R(x + 15, 262, 5, 2, "#ffffff"); R(x + 4, 266, 14, 1, "#ffffff");
  }
  return c;
}

// Sân cỏ sọc cuộn sang trái (vẽ mỗi khung hình)
function drawPitch() {
  var sc = (((groundX || 0) / PX) % 40 + 40) % 40;
  for (var i = -2; i < LW / 20 + 2; i++) {
    R(i * 20 + sc, GY, 20, LH - GY, i % 2 ? "#2f9e44" : "#40b650");
  }
  R(0, GY, LW, 2, "#8be07a");
  R(0, GY + 2, LW, 1, "#1f6f31");
  R(0, GY + 16, LW, 1, "#e8ffe8");
  for (var x = 0; x < LW; x += 2) R(x + (x / 2) % 2, LH - 6, 1, 1, "#1f6f31");
  R(0, LH - 4, LW, 4, "#237a38");
}

// ===== 5. CÚP VÀNG WORLD CUP LÀM "CỘT" =====
// Cúp vẽ theo tọa độ riêng: ly = khoảng cách tính từ phía khe hở ra xa.
// flip = true cho cúp treo ngược từ trên xuống.
function drawTrophy(x0, edge, len, flip) {
  function Q(lx, ly, w, h, c) { R(x0 + lx, flip ? edge - ly - h : edge + ly, w, h, c); }

  // Thân cúp: vàng, có vệt sáng/tối và các dải đá xanh lục
  Q(4, 36, 24, len - 36, P.D);
  Q(5, 36, 22, len - 36, P.gold);
  Q(8, 36, 3, len - 36, P.light);
  Q(22, 36, 4, len - 36, P.gdark);
  for (var by = 50; by < len - 8; by += 30) {
    Q(4, by - 1, 24, 8, P.D);
    Q(5, by, 22, 6, P.green);
    Q(5, by, 22, 1, P.lgreen);
    Q(5, by + 5, 22, 1, P.dgreen);
  }

  // Đầu cúp: nắp -> quả cầu vàng -> vòng cổ -> dải đá xanh
  Q(6, 0, 20, 4, P.D);
  Q(7, 1, 18, 2, P.gold);
  Q(8, 1, 10, 1, P.light);
  disc(Q, 16, 15, 11, P.D);
  disc(Q, 16, 15, 10, P.gold);
  disc(Q, 19, 19, 3, P.gdark);
  disc(Q, 12, 11, 3, "#fff2a8");
  Q(10, 9, 2, 1, "#ffffff");
  Q(7, 15, 18, 1, P.gdark);
  Q(2, 26, 28, 4, P.D);
  Q(3, 27, 26, 2, P.gold);
  Q(3, 27, 26, 1, P.light);
  Q(3, 30, 26, 6, P.D);
  Q(4, 31, 24, 4, P.green);
  Q(4, 31, 24, 1, P.lgreen);
  Q(4, 34, 24, 1, P.dgreen);
}

// ===== 6. TRẠNG THÁI GAME =====
var state = "ready";     // "ready" (chờ) | "play" (đang chơi) | "over" (thua)
var y, vy, pipes, timer, score, best, overTime, groundX, last = null;
var bg = [];

try { best = Number(localStorage.getItem("flappyRonaldoBest")) || 0; }
catch (e) { best = 0; }

function reset() {
  y = H / 2 - 40;
  vy = 0;
  pipes = [];
  timer = SPAWN_EVERY - 0.6;
  score = 0;
  overTime = 0;
  state = "ready";
}
reset();

// ===== 7. ĐIỀU KHIỂN: bấm chuột / chạm màn hình / phím Space =====
function flap() {
  if (state === "ready") { state = "play"; vy = FLAP; }
  else if (state === "play") { vy = FLAP; }
  else if (state === "over" && overTime > 0.4) { reset(); }
}
window.addEventListener("pointerdown", flap);
window.addEventListener("keydown", function (e) {
  if ((e.code === "Space" || e.code === "ArrowUp") && !e.repeat) {
    e.preventDefault();
    flap();
  }
});

// ===== 8. CẬP NHẬT GAME (chạy mỗi khung hình) =====
function spawnPipe() {
  var top = 80;
  var bottom = H - GROUND - 80 - GAP;
  pipes.push({ x: W + 10, gapTop: top + Math.random() * (bottom - top), passed: false });
}

function hitsPipe(p) {
  // Kiểm tra hình tròn (Ronaldo) có chạm hình chữ nhật (cúp) không
  var hx = p.x + PIPE_INSET, hw = PIPE_W - 2 * PIPE_INSET;
  var rects = [
    { x: hx, y: 0, w: hw, h: p.gapTop },
    { x: hx, y: p.gapTop + GAP, w: hw, h: H - GROUND - (p.gapTop + GAP) }
  ];
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    var nx = Math.max(r.x, Math.min(PLAYER_X, r.x + r.w));
    var ny = Math.max(r.y, Math.min(y, r.y + r.h));
    var dx = PLAYER_X - nx, dy = y - ny;
    if (dx * dx + dy * dy < RADIUS * RADIUS) return true;
  }
  return false;
}

function gameOver() {
  state = "over";
  overTime = 0;
  if (score > best) {
    best = score;
    try { localStorage.setItem("flappyRonaldoBest", String(best)); } catch (e) {}
  }
}

function update(dt) {
  groundX = (groundX || 0) - (state === "over" ? 0 : PIPE_SPEED * dt);
  if (state === "ready") { y = H / 2 - 40 + Math.sin(performance.now() / 250) * 8; return; }
  if (state === "over") { overTime += dt; return; }

  vy += GRAVITY * dt;
  y += vy * dt;

  if (y < RADIUS) { y = RADIUS; vy = 0; }
  if (y + RADIUS >= H - GROUND) { y = H - GROUND - RADIUS; gameOver(); return; }

  timer += dt;
  if (timer >= SPAWN_EVERY) { timer = 0; spawnPipe(); }

  for (var i = 0; i < pipes.length; i++) {
    var p = pipes[i];
    p.x -= PIPE_SPEED * dt;
    if (!p.passed && p.x + PIPE_W < PLAYER_X) { p.passed = true; score++; }
    if (hitsPipe(p)) { gameOver(); return; }
  }
  pipes = pipes.filter(function (p) { return p.x + PIPE_W > -10; });
}

// ===== 9. VẼ RONALDO + CHỮ (vẽ lên màn hình chính, nằm trên phong cảnh) =====
function drawPlayer() {
  if (!sprite && img.complete && img.naturalWidth > 0) buildSprite();
  ctx.save();
  ctx.translate(PLAYER_X, y);
  ctx.rotate(Math.max(-0.35, Math.min(0.8, vy / 700)));
  ctx.imageSmoothingEnabled = (PIXEL === 1);
  if (sprite) {
    var k = sprite.k, o = [[-k, 0], [k, 0], [0, -k], [0, k]];   // 4 hướng viền
    for (var i = 0; i < o.length; i++) {
      ctx.drawImage(sprite.sil, -sprite.w / 2 + o[i][0], -sprite.h / 2 + o[i][1], sprite.w, sprite.h);
    }
    ctx.drawImage(sprite.c, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
  } else {                                        // chưa có ảnh: hình tròn đỏ số 7
    ctx.beginPath();
    ctx.arc(0, 0, SIZE / 2 + 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();                                   // viền trắng
    ctx.beginPath();
    ctx.arc(0, 0, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#d8202a";
    ctx.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("7", 0, 2);
  }
  ctx.restore();
}

function text(str, x, yy, size, color) {
  ctx.font = "bold " + size + "px Consolas, 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#2a1a00";
  ctx.strokeText(str, x, yy);
  ctx.fillStyle = color || "#fff";
  ctx.fillText(str, x, yy);
}

// Chữ số điểm kiểu pixel: mỗi số là lưới 3x5 ô
var DIG = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
           "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];
function drawScore(n, cx, top) {
  var s = String(n), u = 6;
  var x0 = Math.round(cx - (s.length * 4 * u - u) / 2);
  for (var pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? "#2a1a00" : "#ffffff";
    var pad = pass === 0 ? 2 : 0;
    for (var d = 0; d < s.length; d++) {
      var g = DIG[+s[d]];
      for (var k = 0; k < 15; k++) {
        if (g[k] === "1") ctx.fillRect(x0 + d * 4 * u + (k % 3) * u - pad, top + Math.floor(k / 3) * u - pad, u + pad * 2, u + pad * 2);
      }
    }
  }
}

function draw() {
  // Bước 1: vẽ phong cảnh lên tấm vẽ nhỏ
  T = L;
  L.drawImage(bg[Math.floor(performance.now() / 350) % 2], 0, 0);   // khán giả đổi tư thế mỗi 0,35 giây
  pipes.forEach(function (p) {
    var x0 = Math.round(p.x / PX);
    var topEdge = Math.round(p.gapTop / PX);
    var botEdge = Math.round((p.gapTop + GAP) / PX);
    drawTrophy(x0, topEdge, topEdge + 4, true);
    drawTrophy(x0, botEdge, GY - botEdge + 4, false);
  });
  drawPitch();

  // Bước 2: phóng to tấm vẽ nhỏ lên màn hình chính (không làm mịn => ra pixel vuông)
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, 0, 0, W, H);

  // Bước 3: Ronaldo và chữ
  drawPlayer();
  if (state === "ready") {
    text("FLAPPY RONALDO", W / 2, 150, 30, "#ffd24a");
    text("Chạm màn hình hoặc nhấn Space", W / 2, 590, 15);
    text("để bay lên", W / 2, 614, 15);
  } else {
    drawScore(score, W / 2, 40);
  }
  if (state === "over") {
    ctx.fillStyle = "#ffd24a"; ctx.fillRect(36, 186, W - 72, 228);
    ctx.fillStyle = "#1d1b3d"; ctx.fillRect(40, 190, W - 80, 220);
    text("GAME OVER", W / 2, 235, 32, "#ffd24a");
    text("Điểm: " + score, W / 2, 292, 24);
    text("Kỷ lục: " + best, W / 2, 332, 24);
    text(overTime > 0.4 ? "Chạm để chơi lại" : " ", W / 2, 380, 16);
  }
}

// ===== 10. VÒNG LẶP GAME =====
bg = [buildBG(0), buildBG(1)];       // vẽ sẵn 2 phiên bản phong cảnh (khán giả 2 tư thế)

function frame(t) {
  var dt = last === null ? 0 : Math.min((t - last) / 1000, 0.033);
  last = t;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
