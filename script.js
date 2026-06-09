// ============================================================
// 테트리스 핵심 데이터, 충돌 판정, 자동 낙하, 키보드 조작
// ============================================================

// --- 캔버스 및 보드 크기 상수 ---
const COLS = 10;
const ROWS = 20;

const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextCtx = nextCanvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');
const gameOverOverlay = document.getElementById('game-over-overlay');
const restartBtn = document.getElementById('restart-btn');

const CELL_SIZE = canvas.width / COLS;
const NEXT_CELL_SIZE = 24;

// 보드 배경색 (순수 검정 대신 깊은 네이비 톤)
const BOARD_BG = '#0d1b2a';
const GRID_COLOR = 'rgba(255, 255, 255, 0.04)';

// --- 7가지 테트로미노 정의 ---
// shape: 4×4 행렬. 1이 채워진 칸, 0이 빈 칸
// color: 블록 본색, highlight: 상단 하이라이트용 밝은 색
const TETROMINOS = {
  I: {
    color: '#4deeea',
    highlight: '#a8f9f8',
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  O: {
    color: '#ffe66d',
    highlight: '#fff3b0',
    shape: [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  T: {
    color: '#c77dff',
    highlight: '#e4b5ff',
    shape: [
      [0, 1, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  S: {
    color: '#70e000',
    highlight: '#b5f77a',
    shape: [
      [0, 1, 1, 0],
      [1, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  Z: {
    color: '#ff5c5c',
    highlight: '#ffa8a8',
    shape: [
      [1, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  J: {
    color: '#4a8fe7',
    highlight: '#93c4ff',
    shape: [
      [1, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  L: {
    color: '#ff9f1c',
    highlight: '#ffc96b',
    shape: [
      [0, 0, 1, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
};

// 낙하 속도 (레벨에 따라 변함)
const BASE_DROP_INTERVAL = 500;  // 레벨 1 기본 간격 (ms)
const MIN_DROP_INTERVAL = 120;   // 최대 속도 하한
const DROP_SPEED_STEP = 35;      // 레벨당 줄어드는 간격 (ms)
const SCORE_PER_LEVEL = 500;     // 이 점수마다 레벨 1 상승

// 줄 삭제 시 점수 (동시에 지운 줄 수 → 점수)
const LINE_SCORES = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

// --- 10×20 보드 그리드 ---
// 0이면 빈 칸, 문자열이면 고정된 블록의 타입 (I, O, T, ...)
const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

// --- 현재 떨어지는 블록 ---
// shape: 현재 회전 상태의 4×4 행렬 (스폰·회전 시 복사본을 사용)
const currentPiece = {
  type: 'T',
  row: 0,
  col: 0,
  shape: null,
};

// --- 다음 블록 (미리보기 + 스폰 대기) ---
const nextPiece = { type: 'I' };

let score = 0;
let totalLines = 0;
let currentLevel = 1;
let gameOver = false;
let dropTimer = null;

/**
 * shape 행렬에서 실제 블록이 차지하는 범위(경계 상자)를 구한다.
 */
function getShapeBounds(shape) {
  let minRow = shape.length;
  let maxRow = 0;
  let minCol = shape[0].length;
  let maxCol = 0;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        minRow = Math.min(minRow, r);
        maxRow = Math.max(maxRow, r);
        minCol = Math.min(minCol, c);
        maxCol = Math.max(maxCol, c);
      }
    }
  }

  return { minRow, maxRow, minCol, maxCol };
}

/**
 * 테트로미노 shape를 보드 가로 중앙에 맞추기 위한 col 값을 계산한다.
 */
function getCenteredCol(shape) {
  const { minCol, maxCol } = getShapeBounds(shape);
  const pieceWidth = maxCol - minCol + 1;
  return Math.floor((COLS - pieceWidth) / 2) - minCol;
}

/**
 * 미리보기 캔버스 안에서 블록을 가로·세로 중앙에 배치할 offset을 계산한다.
 */
function getPreviewOffset(shape, cellSize, canvasWidth, canvasHeight) {
  const { minRow, maxRow, minCol, maxCol } = getShapeBounds(shape);
  const pieceWidth = maxCol - minCol + 1;
  const pieceHeight = maxRow - minRow + 1;
  const gridCols = canvasWidth / cellSize;
  const gridRows = canvasHeight / cellSize;

  return {
    col: (gridCols - pieceWidth) / 2 - minCol,
    row: (gridRows - pieceHeight) / 2 - minRow,
  };
}

/**
 * 7가지 테트로미노 중 하나를 무작위로 선택한다.
 */
function getRandomPieceType() {
  const types = Object.keys(TETROMINOS);
  return types[Math.floor(Math.random() * types.length)];
}

/**
 * shape 행렬의 깊은 복사본을 만든다.
 * 회전 시 원본 TETROMINOS 데이터가 변하지 않도록 한다.
 */
function copyShape(shape) {
  return shape.map((row) => [...row]);
}

/**
 * shape 행렬을 시계 방향으로 90도 회전한다.
 */
function rotateShapeClockwise(shape) {
  const size = shape.length;
  const rotated = Array.from({ length: size }, () => Array(size).fill(0));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      rotated[c][size - 1 - r] = shape[r][c];
    }
  }

  return rotated;
}

/**
 * 주어진 위치에 블록을 놓을 수 있는지 충돌 판정한다.
 * - 좌우·아래 보드 경계를 벗어나면 불가
 * - 보드 안에서 이미 고정된 블록과 겹치면 불가
 * - 위쪽(row < 0)은 스폰 영역이므로 경계 검사에서 제외한다
 *
 * @param {string} type - 테트로미노 타입 (I, O, T, ...)
 * @param {number} row  - 보드 기준 행
 * @param {number} col  - 보드 기준 열
 * @param {number[][]} [shape] - 검사할 shape (생략 시 타입 기본 shape)
 * @returns {boolean} 놓을 수 있으면 true
 */
function isValidPosition(type, row, col, shape = TETROMINOS[type].shape) {

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;

      const boardRow = row + r;
      const boardCol = col + c;

      // 좌우 경계 충돌
      if (boardCol < 0 || boardCol >= COLS) {
        return false;
      }

      // 아래 경계 충돌
      if (boardRow >= ROWS) {
        return false;
      }

      // 고정된 블록과 충돌 (보드 안에 들어온 칸만 검사)
      if (boardRow >= 0 && board[boardRow][boardCol]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * 현재 블록을 보드에 고정한다.
 * shape에서 1인 칸을 board 배열에 타입 문자열로 기록한다.
 */
function lockPiece() {
  const { type, row, col, shape } = currentPiece;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;

      const boardRow = row + r;
      const boardCol = col + c;

      if (boardRow >= 0) {
        board[boardRow][boardCol] = type;
      }
    }
  }
}

/**
 * 가득 찬 줄을 삭제하고 위 블록을 아래로 내린다.
 * 동시에 여러 줄이 지워질 수 있다.
 * @returns {number} 삭제된 줄 수
 */
function clearLines() {
  let linesCleared = 0;
  const remainingRows = [];

  for (let row = 0; row < ROWS; row++) {
    const isFull = board[row].every((cell) => cell !== 0);

    if (isFull) {
      linesCleared++;
    } else {
      remainingRows.push(board[row]);
    }
  }

  // 삭제된 줄 수만큼 위에 빈 줄을 추가해 보드 크기를 유지한다
  while (remainingRows.length < ROWS) {
    remainingRows.unshift(Array(COLS).fill(0));
  }

  for (let row = 0; row < ROWS; row++) {
    board[row] = remainingRows[row];
  }

  return linesCleared;
}

/**
 * 현재 점수에 해당하는 레벨을 계산한다.
 */
function getLevelFromScore() {
  return Math.floor(score / SCORE_PER_LEVEL) + 1;
}

/**
 * 현재 레벨에 맞는 낙하 간격(밀리초)을 계산한다.
 * 레벨이 올라갈수록 간격이 짧아져 속도가 빨라진다.
 */
function getDropInterval() {
  return Math.max(
    MIN_DROP_INTERVAL,
    BASE_DROP_INTERVAL - (currentLevel - 1) * DROP_SPEED_STEP,
  );
}

/**
 * 지운 줄 수에 따라 점수를 더하고 화면에 반영한다.
 */
function addScore(linesCleared) {
  score += LINE_SCORES[linesCleared] || 0;
  totalLines += linesCleared;

  const newLevel = getLevelFromScore();
  if (newLevel > currentLevel) {
    currentLevel = newLevel;
    updateDropSpeed();
  }

  updateStatsDisplay();
}

/**
 * 점수·레벨·라인 표시를 갱신한다.
 */
function updateStatsDisplay() {
  scoreElement.textContent = score;
  levelElement.textContent = currentLevel;
  linesElement.textContent = totalLines;
}

/**
 * 블록을 고정한 뒤 줄 삭제·점수 반영·새 블록 스폰을 처리한다.
 */
function lockAndSpawn() {
  lockPiece();
  const linesCleared = clearLines();

  if (linesCleared > 0) {
    addScore(linesCleared);
  }

  spawnPiece();
}

/**
 * 다음 블록을 현재 블록으로 스폰하고, 새 다음 블록을 준비한다.
 * 스폰 직후 충돌이면 게임 오버로 처리한다.
 */
function spawnPiece() {
  currentPiece.type = nextPiece.type;
  currentPiece.shape = copyShape(TETROMINOS[currentPiece.type].shape);
  currentPiece.row = 0;
  currentPiece.col = getCenteredCol(currentPiece.shape);
  nextPiece.type = getRandomPieceType();

  if (!isValidPosition(currentPiece.type, currentPiece.row, currentPiece.col, currentPiece.shape)) {
    triggerGameOver();
  }
}

/**
 * 게임 오버 상태로 전환하고 낙하를 멈춘다.
 */
function triggerGameOver() {
  gameOver = true;

  if (dropTimer) {
    clearInterval(dropTimer);
    dropTimer = null;
  }

  showGameOverOverlay();
}

/**
 * 게임 오버 오버레이를 표시한다.
 */
function showGameOverOverlay() {
  gameOverOverlay.classList.remove('hidden');
  gameOverOverlay.setAttribute('aria-hidden', 'false');
}

/**
 * 게임 오버 오버레이를 숨긴다.
 */
function hideGameOverOverlay() {
  gameOverOverlay.classList.add('hidden');
  gameOverOverlay.setAttribute('aria-hidden', 'true');
}

/**
 * 보드 그리드를 빈 상태로 초기화한다.
 */
function resetBoard() {
  for (let row = 0; row < ROWS; row++) {
    board[row].fill(0);
  }
}

/**
 * 보드·점수를 초기화하고 게임을 새로 시작한다.
 */
function restartGame() {
  if (dropTimer) {
    clearInterval(dropTimer);
    dropTimer = null;
  }

  gameOver = false;
  score = 0;
  totalLines = 0;
  currentLevel = 1;
  updateStatsDisplay();
  resetBoard();
  hideGameOverOverlay();

  nextPiece.type = getRandomPieceType();
  spawnPiece();
  draw();
  startGameLoop();
}

/**
 * 블록을 한 칸 아래로 이동한다.
 * 더 이상 내려갈 수 없으면 고정 후 새 블록을 스폰한다.
 */
function dropPiece() {
  if (gameOver) return;

  const { type, row, col, shape } = currentPiece;

  if (isValidPosition(type, row + 1, col, shape)) {
    currentPiece.row++;
  } else {
    lockAndSpawn();
  }

  draw();
}

/**
 * 블록을 좌우로 한 칸 이동한다. 충돌 시 이동하지 않는다.
 * @param {number} dCol - 이동 방향 (-1: 왼쪽, 1: 오른쪽)
 */
function movePiece(dCol) {
  if (gameOver) return;

  const { type, row, col, shape } = currentPiece;

  if (isValidPosition(type, row, col + dCol, shape)) {
    currentPiece.col += dCol;
    draw();
  }
}

/**
 * 블록을 시계 방향으로 회전한다.
 * 회전 후 위치가 유효하지 않으면 회전을 취소한다. (벽 차기 없음)
 */
function rotatePiece() {
  if (gameOver) return;

  const { type, row, col, shape } = currentPiece;
  const rotated = rotateShapeClockwise(shape);

  if (isValidPosition(type, row, col, rotated)) {
    currentPiece.shape = rotated;
    draw();
  }
}

/**
 * 블록을 즉시 바닥(또는 다른 블록)까지 떨어뜨린 뒤 고정한다.
 */
function hardDrop() {
  if (gameOver) return;

  const { type, col, shape } = currentPiece;

  while (isValidPosition(type, currentPiece.row + 1, col, shape)) {
    currentPiece.row++;
  }

  lockAndSpawn();
  draw();
}

/**
 * 키보드 입력을 처리한다.
 */
function setupControls() {
  document.addEventListener('keydown', (e) => {
    if (gameOver) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        movePiece(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        movePiece(1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        dropPiece();
        break;
      case 'ArrowUp':
        e.preventDefault();
        rotatePiece();
        break;
      case ' ':
        e.preventDefault();
        hardDrop();
        break;
      default:
        break;
    }
  });
}

/**
 * 현재 레벨에 맞게 낙하 속도를 재설정한다.
 */
function updateDropSpeed() {
  if (gameOver) return;

  if (dropTimer) {
    clearInterval(dropTimer);
  }
  dropTimer = setInterval(dropPiece, getDropInterval());
}

/**
 * 일정 간격으로 블록을 자동 낙하시키는 게임 루프를 시작한다.
 */
function startGameLoop() {
  updateDropSpeed();
}

/**
 * 한 칸의 블록을 입체감 있게 그린다.
 * 본색 → 그라데이션 하이라이트 → 테두리 순으로 렌더링한다.
 */
function drawCell(targetCtx, col, row, color, highlight, cellSize) {
  const gap = 1;
  const x = col * cellSize + gap;
  const y = row * cellSize + gap;
  const size = cellSize - gap * 2;

  // 블록 본체
  targetCtx.fillStyle = color;
  targetCtx.fillRect(x, y, size, size);

  // 상단·좌측 하이라이트 그라데이션
  const gradient = targetCtx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, highlight);
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(1, shadeColor(color, -30));
  targetCtx.fillStyle = gradient;
  targetCtx.globalAlpha = 0.85;
  targetCtx.fillRect(x, y, size, size);
  targetCtx.globalAlpha = 1;

  // 내부 하이라이트 라인
  targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();
  targetCtx.moveTo(x + 3, y + 3);
  targetCtx.lineTo(x + size - 3, y + 3);
  targetCtx.stroke();

  // 외곽 테두리
  targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  targetCtx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

/**
 * hex 색상을 밝거나 어둡게 조정한다. (블록 음영용)
 */
function shadeColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 보드 배경과 은은한 격자선을 그린다.
 */
function drawGrid() {
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;

  for (let col = 0; col <= COLS; col++) {
    const x = col * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let row = 0; row <= ROWS; row++) {
    const y = row * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

/**
 * board 배열에 고정된 블록을 그린다.
 */
function drawBoard() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell) {
        const piece = TETROMINOS[cell] || { color: cell, highlight: cell };
        drawCell(ctx, col, row, piece.color, piece.highlight, CELL_SIZE);
      }
    }
  }
}

/**
 * shape 데이터를 기준으로 블록 묶음을 그린다.
 */
function drawShape(targetCtx, shape, color, highlight, offsetCol, offsetRow, cellSize) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        drawCell(targetCtx, offsetCol + c, offsetRow + r, color, highlight, cellSize);
      }
    }
  }
}

/**
 * 현재 떨어지는 블록을 그린다.
 */
function drawCurrentPiece() {
  if (gameOver) return;

  const { type, row: pieceRow, col: pieceCol, shape } = currentPiece;
  const { color, highlight } = TETROMINOS[type];
  drawShape(ctx, shape, color, highlight, pieceCol, pieceRow, CELL_SIZE);
}

/**
 * 사이드바 '다음 블록' 미리보기를 그린다.
 */
function drawNextPiece() {
  const { color, highlight, shape } = TETROMINOS[nextPiece.type];

  nextCtx.fillStyle = '#0d1b2a';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const { col, row } = getPreviewOffset(
    shape,
    NEXT_CELL_SIZE,
    nextCanvas.width,
    nextCanvas.height,
  );
  drawShape(nextCtx, shape, color, highlight, col, row, NEXT_CELL_SIZE);
}

/**
 * 전체 화면을 그리는 메인 함수.
 */
function draw() {
  drawGrid();
  drawBoard();
  drawCurrentPiece();
  drawNextPiece();
}

/**
 * 게임을 처음 시작하거나 재시작할 때 호출한다.
 */
function initGame() {
  nextPiece.type = getRandomPieceType();
  spawnPiece();
  draw();
  startGameLoop();
}

setupControls();
restartBtn.addEventListener('click', restartGame);
initGame();
