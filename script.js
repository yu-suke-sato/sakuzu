// --- 1. DOM要素の取得 -------------------------
const bgCanvas = document.getElementById('bg-canvas');
const mainCanvas = document.getElementById('main-canvas');
const previewCanvas = document.getElementById('preview-canvas');

const bgCtx = bgCanvas.getContext('2d');
const mainCtx = mainCanvas.getContext('2d'); 
const previewCtx = previewCanvas.getContext('2d');

const toolbar = document.getElementById('toolbar');
const modeToggleButton = document.getElementById('modeToggle');
const bgToggleButton = document.getElementById('bgToggle');
const pasteInput = document.getElementById('pasteInput');
const lineWidthSlider = document.getElementById('lineWidthSlider');
const lineWidthValue = document.getElementById('lineWidthValue');
const compassModeToggleButton = document.getElementById('compassModeToggle');
const undoButton = document.getElementById('undoButton');
const redoButton = document.getElementById('redoButton'); // 追加
const compassLockRadiusButton = document.getElementById('compassLockRadiusButton');
const saveStateButton = document.getElementById('saveStateButton');
const loadStateButton = document.getElementById('loadStateButton');
const clearStateButton = document.getElementById('clearStateButton');
const colorPalette = document.getElementById('color-palette');
const penModeToggleButton = document.getElementById('penModeToggle');
const pasteImageButton = document.getElementById('pasteImageButton');
const lassoButton = document.getElementById('lassoButton');

// --- 2. アプリの状態管理 -------------------------
let isTouchMode = false;
let currentTool = 'none';
let isDrawing = false;

let startPos = { x: 0, y: 0 };
let currentPos = { x: 0, y: 0 };
let selectionRect = null;

let toolSettings = {
    lineWidth: 5,
    lineColor: '#000000'
};

let backgroundMode = 'white'; // 'white' or 'grid'

let tempMainCanvas = document.createElement('canvas');
let tempMainCtx = tempMainCanvas.getContext('2d');

// コンパス
let compassState = 'idle'; 
let compassCenter = null;
let compassRadius = 0; 
let compassStartAngle = 0;
let compassDrawMode = 'arc';
let isRadiusLocked = false;
let lockedRadius = 0;

// ペンモード
let penDrawMode = 'freehand';

// 貼り付け画像
let pastingImage = null;
let pasteScale = 1.0; 
let pastingStage = 'positioning'; 
let pasteFixedPos = null;

// 投げ縄 (Lasso)
let lassoState = 'idle'; // 'idle', 'selecting', 'floating'
let lassoPath = [];
let lassoFloatingImage = null; // 切り取ったキャンバス
let lassoOffset = { x: 0, y: 0 };
let lassoOrigin = { x: 0, y: 0 }; // 切り取り元の左上
let lassoScale = 1.0; // 拡大縮小率

// Undo / Redo
let undoHistory = [];
let redoHistory = []; // Redo用履歴
const MAX_UNDO_STEPS = 20; 

// Storage
const STORAGE_KEY_MAIN = 'digitalDrawingApp_mainCanvas';
const STORAGE_KEY_POINTS = 'digitalDrawingApp_pointsHistory';

// 点・スナップ
let pointsHistory = []; 
const SNAP_DISTANCE = 15; 
const POINT_RADIUS = 6; 


// --- 3. 初期化処理 ---
window.addEventListener('load', initialize);
window.addEventListener('resize', resizeAllCanvas);

function initialize() {
    setupToolbarListeners(); 
    setupCanvasListeners();
    setupCompassModeToggle();
    setupCompassLockRadiusButton();
    setupStateButtons();
    setupColorPalette();
    setupPenModeToggle();
    setupBgToggle();

    lineWidthSlider.addEventListener('input', (e) => {
        toolSettings.lineWidth = parseInt(e.target.value, 10);
        lineWidthValue.textContent = toolSettings.lineWidth;
        
        // 貼り付けモードのリサイズ
        if (currentTool === 'paste' && pastingImage) {
            pasteScale = toolSettings.lineWidth / 20.0;
            let targetPos = (pastingStage === 'resizing') ? pasteFixedPos : currentPos;
            if (targetPos) drawPastePreview(targetPos);
        }
        
        // 投げ縄モードのリサイズ
        if (currentTool === 'lasso' && lassoState === 'floating' && lassoFloatingImage) {
            lassoScale = toolSettings.lineWidth / 20.0;
            drawFloatingLasso();
        }
    });

    if ('ontouchstart' in window) {
        toggleMode(true);
    }
    
    resizeAllCanvas();
    applyToolSettings(mainCtx);
    
    document.querySelector('.color-button[data-color="#000000"]').classList.add('selected');
    
    try {
        if (localStorage.getItem(STORAGE_KEY_MAIN)) {
            if (confirm('以前保存した作業データが見つかりました。読み込みますか？')) {
                loadStateFromLocalStorage();
            }
        }
    } catch (e) {
        console.warn("ローカルストレージへのアクセスに失敗しました。", e.message);
    }
}

// --- 4. キャンバスリサイズ ---
function resizeAllCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = document.getElementById('canvas-container').getBoundingClientRect();
    
    if (mainCanvas.width > 0 && mainCanvas.height > 0) {
         tempMainCanvas.width = mainCanvas.width;
         tempMainCanvas.height = mainCanvas.height;
         tempMainCtx.scale(dpr, dpr);
         tempMainCtx.drawImage(mainCanvas, 0, 0, mainCanvas.width / dpr, mainCanvas.height / dpr);
         tempMainCtx.setTransform(1, 0, 0, 1, 0, 0); 
    }

    [bgCanvas, mainCanvas, previewCanvas].forEach(canvas => {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    });
    
    applyToolSettings(mainCtx);
    
    if (tempMainCanvas.width > 0) {
         mainCtx.drawImage(tempMainCanvas, 0, 0, tempMainCanvas.width / dpr, tempMainCanvas.height / dpr);
    }
    
    redrawBgCanvas();
}

function redrawBgCanvas() {
    const dpr = window.devicePixelRatio || 1;
    bgCtx.clearRect(0, 0, bgCanvas.width / dpr, bgCanvas.height / dpr);
    
    // 背景モードに従う
    if (backgroundMode === 'grid') {
        drawGrid(bgCtx);
    } else {
        bgCtx.fillStyle = '#ffffff';
        bgCtx.fillRect(0, 0, bgCanvas.width / dpr, bgCanvas.height / dpr);
    }
}

function drawGrid(ctx) {
    const width = bgCanvas.width / (window.devicePixelRatio || 1);
    const height = bgCanvas.height / (window.devicePixelRatio || 1);
    const gridSize = 50; 

    ctx.beginPath();
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();
}

function applyToolSettings(ctx) {
    ctx.strokeStyle = toolSettings.lineColor;
    ctx.lineWidth = toolSettings.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = (currentTool === 'eraser') ? 'destination-out' : 'source-over';
    ctx.setLineDash([]); 
}

// --- 5. ツールバー設定 ---

function setupBgToggle() {
    bgToggleButton.addEventListener('click', () => {
        if (backgroundMode === 'white') {
            backgroundMode = 'grid';
            bgToggleButton.textContent = '背景: 方眼';
        } else {
            backgroundMode = 'white';
            bgToggleButton.textContent = '背景: 白';
        }
        redrawBgCanvas();
    });
}

function setupColorPalette() {
    colorPalette.addEventListener('click', (e) => {
        const target = e.target.closest('.color-button');
        if (!target) return;
        const newColor = target.dataset.color;
        toolSettings.lineColor = newColor;
        applyToolSettings(mainCtx);
        toolbar.querySelectorAll('.color-button').forEach(btn => {
            btn.classList.remove('selected');
        });
        target.classList.add('selected');
    });
}

// 太さ変更ヘルパー
function setLineWidth(width) {
    toolSettings.lineWidth = width;
    lineWidthSlider.value = width;
    lineWidthValue.textContent = width;
}

function setupPenModeToggle() {
    penModeToggleButton.addEventListener('click', () => {
        if (penDrawMode === 'freehand') {
            penDrawMode = 'point';
            penModeToggleButton.textContent = '3b. フリーハンド';
            setLineWidth(10); 
        } else {
            penDrawMode = 'freehand';
            penModeToggleButton.textContent = '3b. 点を打つ';
            setLineWidth(5); 
        }
        currentTool = 'pen';
        setActiveButton(document.getElementById('penButton'));
    });
}

function setupCompassModeToggle() {
    compassModeToggleButton.addEventListener('click', () => {
        if (compassDrawMode === 'arc') {
            compassDrawMode = 'circle';
            compassModeToggleButton.textContent = '1b. 弧を描く';
        } else {
            compassDrawMode = 'arc';
            compassModeToggleButton.textContent = '1b. 円を描く';
        }
    });
}

function setupCompassLockRadiusButton() {
    compassLockRadiusButton.addEventListener('click', () => {
        isRadiusLocked = !isRadiusLocked;
        if (isRadiusLocked) {
            if (compassRadius > 0) {
                lockedRadius = compassRadius;
                compassLockRadiusButton.classList.add('active-lock');
                compassLockRadiusButton.textContent = '1c. 半径解除';
            } else {
                isRadiusLocked = false; 
                alert("先に円か弧を描画して半径を決定してください。");
            }
        } else {
            lockedRadius = 0;
            compassLockRadiusButton.classList.remove('active-lock');
            compassLockRadiusButton.textContent = '1c. 半径を固定';
        }
    });
}

function setupStateButtons() {
    saveStateButton.addEventListener('click', saveStateToLocalStorage);
    loadStateButton.addEventListener('click', loadStateFromLocalStorage);
    clearStateButton.addEventListener('click', clearStateFromLocalStorage);
}

function setupToolbarListeners() {
    modeToggleButton.addEventListener('click', () => toggleMode());
    undoButton.addEventListener('click', undoLastAction);
    redoButton.addEventListener('click', redoLastAction); // 追加

    toolbar.addEventListener('click', (e) => {
        if (e.target.classList.contains('color-button')) return;
        
        const target = e.target.closest('button');
        const ignoreList = ['compassModeToggle', 'penModeToggle', 'modeToggle', 'undoButton', 'redoButton', 'compassLockRadiusButton', 'saveStateButton', 'loadStateButton', 'clearStateButton', 'pasteImageButton', 'bgToggle'];
        if (!target || ignoreList.includes(target.id)) return;

        const id = target.id;
        
        // ツール切り替え時のクリーンアップ
        if (target.classList.contains('tool-button')) {
            
            if (id !== 'compassButton' && compassState !== 'idle') {
                compassState = 'idle';
                compassCenter = null;
                clearPreviewCanvas();
                isDrawing = false;
            }
            
            if (id !== 'pasteImageButton' && currentTool === 'paste') {
                pastingImage = null;
                clearPreviewCanvas();
                pastingStage = 'positioning';
                pasteFixedPos = null;
            }

            // 投げ縄の確定処理（他のツールに移った場合）
            if (currentTool === 'lasso' && lassoState === 'floating') {
                commitLasso();
            }
            if (id !== 'lassoButton') {
                lassoState = 'idle';
                lassoPath = [];
                lassoFloatingImage = null;
            }

            switch (id) {
                case 'penButton': 
                    currentTool = 'pen'; 
                    // ペンモード選択時の太さ初期化
                    if (penDrawMode === 'point') {
                        setLineWidth(10); 
                    } else {
                        setLineWidth(5); 
                    }
                    break;
                case 'rulerButton': 
                    currentTool = 'ruler'; 
                    setLineWidth(2);
                    break;
                case 'compassButton': 
                    currentTool = 'compass'; 
                    setLineWidth(2);
                    break;
                case 'eraserButton': currentTool = 'eraser'; break;
                case 'selectEraseButton': currentTool = 'selectErase'; break;
                case 'lassoButton': currentTool = 'lasso'; break;
                
                case 'clearAllButton':
                    if (confirm('描画内容をすべて消去しますか？')) {
                        saveUndoState();
                        clearMainCanvas();
                        pointsHistory = []; 
                    }
                    return; 
                case 'saveFullButton':
                    saveFullCanvas();
                    return;
            }
            
            applyToolSettings(mainCtx); 
            setActiveButton(target);
        }
    });
    
    pasteImageButton.addEventListener('click', () => {
        pasteInput.click();
    });
    
    pasteInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            pastingImage = new Image();
            pastingImage.onload = function() {
                currentTool = 'paste';
                pasteScale = toolSettings.lineWidth / 20.0; 
                pastingStage = 'positioning';
                pasteFixedPos = null;
                setActiveButton(pasteImageButton);
                alert("貼り付けモード:\n1. クリックして位置を決定\n2. スライダーでサイズを調整\n3. もう一度クリックして確定");
            }
            pastingImage.src = evt.target.result;
        }
        reader.readAsDataURL(file);
        e.target.value = null;
    });
}

function setActiveButton(activeButton) {
    toolbar.querySelectorAll('.tool-button').forEach(btn => {
        const ignoreList = ['compassModeToggle', 'penModeToggle', 'modeToggle', 'undoButton', 'redoButton', 'compassLockRadiusButton', 'saveStateButton', 'loadStateButton', 'clearStateButton', 'bgToggle'];
        if (!ignoreList.includes(btn.id)) {
            btn.classList.remove('active');
        }
    });
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

function toggleMode(forceTouch = null) {
    isTouchMode = forceTouch !== null ? forceTouch : !isTouchMode;
    document.body.classList.toggle('touch-mode', isTouchMode);
    modeToggleButton.textContent = isTouchMode ? 'マウスモードへ' : 'タッチモードへ';
}


// --- 6. キャンバス描画 (Pointer Events) ---

function setupCanvasListeners() {
    previewCanvas.addEventListener('pointerdown', handlePointerDown);
    previewCanvas.addEventListener('pointermove', handlePointerMove);
    previewCanvas.addEventListener('pointerup', handlePointerUp);
    previewCanvas.addEventListener('pointerleave', handlePointerLeave);
}

function handlePointerDown(e) {
    if (toolbar.contains(e.target) || currentTool === 'none') return;
    e.preventDefault();
    const pos = getPosition(e);
    
    // --- 投げ縄ツール ---
    if (currentTool === 'lasso') {
        if (lassoState === 'floating') {
            // フローティング画像をタップしたかチェック
            // 拡大率を考慮した矩形判定
            const dpr = window.devicePixelRatio || 1;
            const w = (lassoFloatingImage.width / dpr) * lassoScale;
            const h = (lassoFloatingImage.height / dpr) * lassoScale;
            
            const rect = {
                x: lassoOrigin.x + lassoOffset.x,
                y: lassoOrigin.y + lassoOffset.y,
                w: w,
                h: h
            };
            if (pos.x >= rect.x && pos.x <= rect.x + rect.w &&
                pos.y >= rect.y && pos.y <= rect.y + rect.h) {
                // ドラッグ開始
                startPos = pos;
                isDrawing = true; // ドラッグフラグとして使用
            } else {
                // 範囲外タップで確定
                commitLasso();
            }
        } else {
            // 新規選択開始
            lassoState = 'selecting';
            lassoPath = [pos];
            isDrawing = true;
            clearPreviewCanvas();
        }
        return;
    }

    // --- 画像貼り付け ---
    if (currentTool === 'paste' && pastingImage) {
        if (pastingStage === 'positioning') {
            pasteFixedPos = pos;
            pastingStage = 'resizing';
            drawPastePreview(pasteFixedPos);
        } else if (pastingStage === 'resizing') {
            saveUndoState();
            const width = pastingImage.width * pasteScale;
            const height = pastingImage.height * pasteScale;
            mainCtx.drawImage(pastingImage, pasteFixedPos.x - width/2, pasteFixedPos.y - height/2, width, height);
            pastingImage = null;
            clearPreviewCanvas();
            pastingStage = 'positioning';
            pasteFixedPos = null;
            currentTool = 'none'; 
            setActiveButton(null);
        }
        return;
    }

    // --- 点を打つ ---
    if (currentTool === 'pen' && penDrawMode === 'point') {
        saveUndoState();
        const pointPos = getSnappedPoint(pos); 
        drawPoint(mainCtx, pointPos); 
        pointsHistory.push({ x: pointPos.x, y: pointPos.y }); 
        isDrawing = false; 
        return;
    }

    // --- スナップ開始点 ---
    let snappedPos = pos;
    if (currentTool === 'ruler' || (currentTool === 'compass' && compassState === 'idle')) {
        const p = getSnappedPoint(pos);
        snappedPos = { x: p.x, y: p.y };
    }
    startPos = snappedPos;

    // --- コンパス ---
    if (currentTool === 'compass') {
        saveUndoState(); 
        if (compassDrawMode === 'circle') {
            compassCenter = startPos;
            compassState = 'drawingArc';
            isDrawing = true;
            currentPos = startPos;
            compassRadius = isRadiusLocked ? lockedRadius : 0;
            clearPreviewCanvas();
            drawCross(previewCtx, compassCenter, 5, 'black');
        } else {
            if (compassState === 'idle') {
                compassCenter = startPos;
                compassState = 'centerSet';
                isDrawing = false;
                clearPreviewCanvas();
                drawCross(previewCtx, compassCenter, 5, 'black');
                return; 
            }
            if (compassState === 'centerSet') {
                isDrawing = true; 
                startPos = { ...getSnappedPoint(pos) }; 
                compassStartAngle = Math.atan2(startPos.y - compassCenter.y, startPos.x - compassCenter.x);
                compassState = 'drawingArc';
                currentPos = startPos;
                if (isRadiusLocked) {
                    compassRadius = lockedRadius;
                } else {
                    compassRadius = Math.hypot(startPos.x - compassCenter.x, startPos.y - compassCenter.y);
                }
            }
        }
    } 
    else if (currentTool === 'pen' || currentTool === 'eraser' || currentTool === 'ruler' || currentTool === 'selectErase') {
        saveUndoState();
        isDrawing = true;
        currentPos = startPos;
    }

    selectionRect = null;

    if ((currentTool === 'pen' && penDrawMode === 'freehand') || currentTool === 'eraser') {
        applyToolSettings(mainCtx);
        mainCtx.beginPath();
        mainCtx.moveTo(startPos.x, startPos.y);
    }
}

function handlePointerMove(e) {
    const rawPos = getPosition(e);

    // --- 投げ縄ツール ---
    if (currentTool === 'lasso') {
        e.preventDefault();
        if (lassoState === 'selecting' && isDrawing) {
            // 選択範囲を描画
            lassoPath.push(rawPos);
            drawLassoPath(lassoPath);
        } else if (lassoState === 'floating' && isDrawing) {
            // 移動中
            lassoOffset.x += rawPos.x - startPos.x;
            lassoOffset.y += rawPos.y - startPos.y;
            startPos = rawPos; // 次の差分計算のために更新
            drawFloatingLasso();
        }
        return;
    }

    // --- 画像貼り付け ---
    if (currentTool === 'paste' && pastingImage) {
        if (pastingStage === 'positioning') {
            currentPos = rawPos;
            drawPastePreview(rawPos);
        }
        return;
    }

    if (!isDrawing && (compassDrawMode !== 'arc' || compassState !== 'centerSet') && (currentTool !== 'ruler') && !(currentTool === 'compass' && compassState === 'idle')) return;
    e.preventDefault();
    
    // --- 定規 ---
    if (currentTool === 'ruler') {
        const snapped = getSnappedPoint(rawPos);
        currentPos = { x: snapped.x, y: snapped.y };
        clearPreviewCanvas();
        if (snapped.x !== rawPos.x || snapped.y !== rawPos.y) drawSnapIndicator(previewCtx, snapped);
        if (getSnappedPoint(startPos) !== startPos) drawSnapIndicator(previewCtx, startPos);
        if (isDrawing) {
            previewCtx.beginPath();
            previewCtx.moveTo(startPos.x, startPos.y);
            previewCtx.lineTo(currentPos.x, currentPos.y);
            applyToolSettings(previewCtx);
            previewCtx.setLineDash([5, 5]);
            previewCtx.stroke();
            previewCtx.setLineDash([]);
        }
        return; 
    }

    // --- コンパス ---
    if (currentTool === 'compass') {
        if (compassDrawMode === 'circle') {
            if (compassState === 'idle') {
                const snapped = getSnappedPoint(rawPos);
                clearPreviewCanvas();
                drawCross(previewCtx, snapped, 5, 'black');
                if (snapped.x !== rawPos.x || snapped.y !== rawPos.y) drawSnapIndicator(previewCtx, snapped);
                return;
            }
            if (compassState === 'drawingArc' && isDrawing) {
                let radius;
                if (isRadiusLocked) {
                    currentPos = rawPos;
                    radius = lockedRadius;
                } else {
                    const snapped = getSnappedPoint(rawPos);
                    currentPos = { x: snapped.x, y: snapped.y };
                    radius = Math.hypot(currentPos.x - compassCenter.x, currentPos.y - compassCenter.y);
                }
                clearPreviewCanvas();
                drawCross(previewCtx, compassCenter, 5, 'black');
                drawRadiusLine(previewCtx, compassCenter, currentPos, 'red');
                drawCircle(previewCtx, compassCenter.x, compassCenter.y, radius, 'red', 1, true);
                if (!isRadiusLocked && (currentPos.x !== rawPos.x || currentPos.y !== rawPos.y)) {
                     drawSnapIndicator(previewCtx, currentPos);
                }
                return;
            }
        } else {
            if (compassState === 'idle') {
                const snapped = getSnappedPoint(rawPos);
                clearPreviewCanvas();
                drawCross(previewCtx, snapped, 5, 'black');
                if (snapped.x !== rawPos.x || snapped.y !== rawPos.y) drawSnapIndicator(previewCtx, snapped);
                return;
            }
            if (compassState === 'centerSet') {
                const snapped = getSnappedPoint(rawPos);
                const pRadius = isRadiusLocked ? lockedRadius : Math.hypot(snapped.x - compassCenter.x, snapped.y - compassCenter.y);
                clearPreviewCanvas();
                drawCross(previewCtx, compassCenter, 5, 'black');
                drawRadiusLine(previewCtx, compassCenter, snapped, 'red');
                drawCircle(previewCtx, compassCenter.x, compassCenter.y, pRadius, 'red', 1, true);
                if (!isRadiusLocked && (snapped.x !== rawPos.x || snapped.y !== rawPos.y)) drawSnapIndicator(previewCtx, snapped);
                return; 
            }
            if (compassState === 'drawingArc' && isDrawing) {
                const snapped = getSnappedPoint(rawPos);
                currentPos = { x: snapped.x, y: snapped.y };
                clearPreviewCanvas();
                drawRadiusLine(previewCtx, compassCenter, startPos, 'red');
                drawCircle(previewCtx, compassCenter.x, compassCenter.y, compassRadius, 'red', 1, true); 
                if (getSnappedPoint(startPos) !== startPos) drawSnapIndicator(previewCtx, startPos); 
                if (currentPos.x !== rawPos.x || currentPos.y !== rawPos.y) drawSnapIndicator(previewCtx, currentPos);

                let currentAngle = Math.atan2(currentPos.y - compassCenter.y, currentPos.x - compassCenter.x);
                let crossProduct = (startPos.x - compassCenter.x) * (currentPos.y - compassCenter.y) - (startPos.y - compassCenter.y) * (currentPos.x - compassCenter.x);
                let drawAsCounterClockwise = (crossProduct < 0);
                
                previewCtx.beginPath();
                previewCtx.arc(compassCenter.x, compassCenter.y, compassRadius, compassStartAngle, currentAngle, drawAsCounterClockwise);
                applyToolSettings(previewCtx); 
                previewCtx.stroke();
                return; 
            }
        }
    }
    
    // --- ペン・消しゴム・選択消去 ---
    if (isDrawing) {
        currentPos = rawPos;
        switch (currentTool) {
            case 'pen':
                if (penDrawMode === 'freehand') {
                    mainCtx.lineTo(currentPos.x, currentPos.y);
                    mainCtx.stroke();
                }
                break;
            case 'eraser':
                mainCtx.lineTo(currentPos.x, currentPos.y);
                mainCtx.stroke();
                break;
            case 'selectErase': {
                clearPreviewCanvas();
                previewCtx.strokeStyle = '#007bff';
                previewCtx.lineWidth = 1;
                previewCtx.setLineDash([4, 2]);
                const rect = getRect(startPos, currentPos);
                previewCtx.strokeRect(rect.x, rect.y, rect.w, rect.h);
                previewCtx.setLineDash([]);
                break;
            }
        }
    }
}

function handlePointerUp(e) {
    e.preventDefault();
    
    if (currentTool === 'paste') return;
    if (currentTool === 'pen' && penDrawMode === 'point') return;

    // --- 投げ縄ツール ---
    if (currentTool === 'lasso') {
        if (lassoState === 'selecting' && isDrawing) {
            isDrawing = false;
            cutSelection();
        } else if (lassoState === 'floating' && isDrawing) {
            isDrawing = false;
            // 移動終了（まだ確定しない）
        }
        return;
    }
    
    // --- コンパス ---
    if (currentTool === 'compass') {
        if (compassDrawMode === 'circle') {
            if (compassState === 'drawingArc' && isDrawing) {
                isDrawing = false;
                const pos = getSnappedPoint(getPosition(e));
                let finalRadius = isRadiusLocked ? lockedRadius : Math.hypot(pos.x - compassCenter.x, pos.y - compassCenter.y);
                if (!isRadiusLocked) compassRadius = finalRadius;

                clearPreviewCanvas();
                applyToolSettings(mainCtx); 
                drawCircle(mainCtx, compassCenter.x, compassCenter.y, finalRadius, toolSettings.lineColor, toolSettings.lineWidth, false);
                compassState = 'idle';
                compassCenter = null;
                return;
            }
        } else {
            if (compassState === 'centerSet') return; 
            if (compassState === 'drawingArc' && isDrawing) {
                isDrawing = false;
                clearPreviewCanvas();
                applyToolSettings(mainCtx); 
                const p = getSnappedPoint(getPosition(e));
                let endAngle = Math.atan2(p.y - compassCenter.y, p.x - compassCenter.x);
                let crossProduct = (startPos.x - compassCenter.x) * (p.y - compassCenter.y) - (startPos.y - compassCenter.y) * (p.x - compassCenter.x);
                let drawAsCounterClockwise = (crossProduct < 0);
                mainCtx.beginPath();
                mainCtx.arc(compassCenter.x, compassCenter.y, compassRadius, compassStartAngle, endAngle, drawAsCounterClockwise);
                mainCtx.stroke();
                compassState = 'idle';
                compassCenter = null;
                return;
            }
        }
    }

    if (!isDrawing) return;
    isDrawing = false;
    clearPreviewCanvas(); 
    
    switch (currentTool) {
        case 'pen':
        case 'eraser':
            mainCtx.closePath();
            break;
        case 'ruler': {
            const rawPos = getPosition(e);
            const snappedPos = getSnappedPoint(rawPos);
            currentPos = { x: snappedPos.x, y: snappedPos.y }; 
            applyToolSettings(mainCtx);
            mainCtx.beginPath();
            mainCtx.moveTo(startPos.x, startPos.y); 
            mainCtx.lineTo(currentPos.x, currentPos.y);
            mainCtx.stroke();
            break;
        }
        case 'selectErase': {
            selectionRect = getRect(startPos, currentPos);
            mainCtx.clearRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
            selectionRect = null;
            break;
        }
    }
}

function handlePointerLeave(e) {
     if (currentTool === 'compass' && compassState !== 'idle') {
         compassState = 'idle';
         compassCenter = null;
         isDrawing = false;
         clearPreviewCanvas();
         return;
     }
     if (isDrawing) {
         handlePointerUp(e);
     }
}

// --- 7. 投げ縄ツール 処理関数 ---

function drawLassoPath(path) {
    clearPreviewCanvas();
    if (path.length < 2) return;
    previewCtx.beginPath();
    previewCtx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        previewCtx.lineTo(path[i].x, path[i].y);
    }
    previewCtx.strokeStyle = '#555';
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([5, 5]);
    previewCtx.stroke();
    previewCtx.setLineDash([]);
}

function cutSelection() {
    if (lassoPath.length < 3) {
        lassoState = 'idle';
        clearPreviewCanvas();
        return;
    }
    
    saveUndoState(); // 切り取り前の状態を保存

    // 1. バウンディングボックス計算
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    lassoPath.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    });
    const w = maxX - minX;
    const h = maxY - minY;
    
    if (w <= 0 || h <= 0) { lassoState = 'idle'; return; }

    // 2. 選択範囲のピクセルを抽出するためのオフスクリーンCanvas
    const dpr = window.devicePixelRatio || 1;
    const cutCanvas = document.createElement('canvas');
    cutCanvas.width = w * dpr;
    cutCanvas.height = h * dpr;
    const cutCtx = cutCanvas.getContext('2d');
    cutCtx.scale(dpr, dpr);

    // パスでクリップしてメインキャンバスから描画
    cutCtx.beginPath();
    cutCtx.moveTo(lassoPath[0].x - minX, lassoPath[0].y - minY);
    for (let i = 1; i < lassoPath.length; i++) {
        cutCtx.lineTo(lassoPath[i].x - minX, lassoPath[i].y - minY);
    }
    cutCtx.closePath();
    cutCtx.clip();
    cutCtx.drawImage(mainCanvas, minX * dpr, minY * dpr, w * dpr, h * dpr, 0, 0, w, h);

    lassoFloatingImage = cutCanvas;
    lassoOrigin = { x: minX, y: minY };
    lassoOffset = { x: 0, y: 0 };
    lassoState = 'floating';
    
    // 拡大率の初期化 (等倍=スライダー20)
    lassoScale = 1.0;
    setLineWidth(20);

    // 3. メインキャンバスから選択範囲を消去
    mainCtx.save();
    mainCtx.beginPath();
    mainCtx.moveTo(lassoPath[0].x, lassoPath[0].y);
    for (let i = 1; i < lassoPath.length; i++) {
        mainCtx.lineTo(lassoPath[i].x, lassoPath[i].y);
    }
    mainCtx.closePath();
    mainCtx.clip();
    mainCtx.clearRect(minX, minY, w, h); // クリップ範囲内で消去
    mainCtx.restore();

    drawFloatingLasso();
}

function drawFloatingLasso() {
    clearPreviewCanvas();
    if (!lassoFloatingImage) return;
    
    const x = lassoOrigin.x + lassoOffset.x;
    const y = lassoOrigin.y + lassoOffset.y;
    const dpr = window.devicePixelRatio || 1;
    
    // 拡大縮小を反映させたサイズ
    const w = (lassoFloatingImage.width / dpr) * lassoScale;
    const h = (lassoFloatingImage.height / dpr) * lassoScale;

    // 切り取り画像の描画
    previewCtx.drawImage(lassoFloatingImage, 0, 0, lassoFloatingImage.width, lassoFloatingImage.height, x, y, w, h);
    
    // 枠線表示
    previewCtx.strokeStyle = 'blue';
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([5, 5]);
    previewCtx.strokeRect(x, y, w, h);
    previewCtx.setLineDash([]);
}

function commitLasso() {
    if (lassoState !== 'floating' || !lassoFloatingImage) return;
    
    // 確定時はUndoを保存しない（切り取り時で1アクションとするため）
    
    const x = lassoOrigin.x + lassoOffset.x;
    const y = lassoOrigin.y + lassoOffset.y;
    const dpr = window.devicePixelRatio || 1;
    const w = (lassoFloatingImage.width / dpr) * lassoScale;
    const h = (lassoFloatingImage.height / dpr) * lassoScale;

    // キャンバスに描画を確定
    mainCtx.drawImage(lassoFloatingImage, 0, 0, lassoFloatingImage.width, lassoFloatingImage.height, x, y, w, h);

    // ▼ 追加: 選択範囲内の点(pointsHistory)も移動させる ▼
    if (pointsHistory.length > 0 && lassoPath.length > 0) {
        // 判定用のパスオブジェクトを作成
        // (Canvasのコンテキストに依存せず座標計算するためPath2Dを使用)
        /* 注意: isPointInPathは現在のコンテキストの変換マトリックスの影響を受ける可能性があるため、
           数学的な判定を行うか、変換のかかっていないコンテキストで判定するのが確実です。
           ここでは簡易的な多角形内判定(Ray-casting法)を用いて実装します。
        */
        
        for (let i = 0; i < pointsHistory.length; i++) {
            const pt = pointsHistory[i];
            
            // 点が元の選択範囲（lassoPath）の中にあるか判定
            if (isPointInPolygon(pt, lassoPath)) {
                // 元の原点(lassoOrigin)からの相対位置を計算
                const relX = pt.x - lassoOrigin.x;
                const relY = pt.y - lassoOrigin.y;
                
                // 新しい位置 = (移動先原点) + (相対位置 * 拡大率)
                pt.x = x + (relX * lassoScale);
                pt.y = y + (relY * lassoScale);
            }
        }
    }
    // ▲ 追加ここまで ▲

    lassoState = 'idle';
    lassoFloatingImage = null;
    lassoPath = [];
    clearPreviewCanvas();
}

// ▼ 追加: 多角形の内外判定を行うヘルパー関数 ▼
function isPointInPolygon(point, vs) {
    // Ray-casting algorithm
    const x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].x, yi = vs[i].y;
        const xj = vs[j].x, yj = vs[j].y;
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
// --- 8. その他 機能 ---

function drawPastePreview(pos) {
    clearPreviewCanvas();
    if (!pastingImage) return;
    const width = pastingImage.width * pasteScale;
    const height = pastingImage.height * pasteScale;
    
    previewCtx.globalAlpha = 0.5; 
    previewCtx.drawImage(pastingImage, pos.x - width/2, pos.y - height/2, width, height);
    previewCtx.globalAlpha = 1.0;
    
    previewCtx.strokeStyle = 'blue';
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([5, 5]);
    previewCtx.strokeRect(pos.x - width/2, pos.y - height/2, width, height);
    previewCtx.setLineDash([]);
}

function clearMainCanvas() {
    const dpr = window.devicePixelRatio || 1;
    mainCtx.clearRect(0, 0, mainCanvas.width / dpr, mainCanvas.height / dpr);
}

function clearPreviewCanvas() {
    const dpr = window.devicePixelRatio || 1;
    previewCtx.clearRect(0, 0, previewCanvas.width / dpr, previewCanvas.height / dpr);
}

function drawCircle(ctx, x, y, radius, color, width, isPreview) {
    ctx.beginPath();
    if (radius <= 0) return;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (isPreview) ctx.setLineDash([5, 5]);
    ctx.stroke();
    if (isPreview) ctx.setLineDash([]);
}

function saveFullCanvas() {
    try {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = mainCanvas.width;
        tempCanvas.height = mainCanvas.height;
        
        // 背景描画
        if (backgroundMode === 'grid') {
            // グリッドを白背景の上に描画
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(bgCanvas, 0, 0);
        } else {
            tempCtx.fillStyle = '#ffffff';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        }

        tempCtx.drawImage(mainCanvas, 0, 0);
        const dataURL = tempCanvas.toDataURL('image/png');
        downloadImage(dataURL, 'my-drawing.png');
    } catch (err) {
        console.error("保存失敗:", err);
        alert("画像の保存に失敗しました。");
    }
}

// --- 9. ユーティリティ ---

function getPosition(e) {
    const rect = previewCanvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function getRect(pos1, pos2) {
    const x = Math.min(pos1.x, pos2.x);
    const y = Math.min(pos1.y, pos2.y);
    const w = Math.abs(pos1.x - pos2.x);
    const h = Math.abs(pos1.y - pos2.y);
    return { x, y, w, h };
}

function downloadImage(dataURL, filename) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function drawCross(ctx, point, size, color) {
    ctx.beginPath();
    ctx.moveTo(point.x - size, point.y);
    ctx.lineTo(point.x + size, point.y);
    ctx.moveTo(point.x, point.y - size);
    ctx.lineTo(point.x, point.y + size);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();
}

function drawRadiusLine(ctx, center, point, color) {
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawPoint(ctx, pos) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = toolSettings.lineColor; 
    ctx.fill();
}

function getSnappedPoint(pos) {
    for (const point of pointsHistory) {
        const distance = Math.hypot(pos.x - point.x, pos.y - point.y);
        if (distance < SNAP_DISTANCE) {
            return { x: point.x, y: point.y }; 
        }
    }
    return { x: pos.x, y: pos.y };
}

function drawSnapIndicator(ctx, pos) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, SNAP_DISTANCE, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)'; 
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
}

// Undo/Redo/State
function restoreCanvasState(dataURL, targetCtx, callback = null) {
    if (!dataURL) {
        const dpr = window.devicePixelRatio || 1;
        targetCtx.clearRect(0, 0, targetCtx.canvas.width / dpr, targetCtx.canvas.height / dpr);
        if (callback) callback();
        return;
    }
    const img = new Image();
    img.onload = function() {
        const dpr = window.devicePixelRatio || 1;
        targetCtx.clearRect(0, 0, targetCtx.canvas.width / dpr, targetCtx.canvas.height / dpr);
        targetCtx.drawImage(img, 0, 0, mainCtx.canvas.width / dpr, mainCtx.canvas.height / dpr);
        if (callback) callback();
    }
    img.src = dataURL;
}

// ▼ 修正: 新しいアクション時にRedo履歴をクリア ▼
function saveUndoState() {
    redoHistory = []; // 新しい操作をしたらやり直し履歴は無効化

    if (undoHistory.length >= MAX_UNDO_STEPS) {
        undoHistory.shift(); 
    }
    const mainData = mainCanvas.toDataURL();
    const pointsData = JSON.parse(JSON.stringify(pointsHistory)); 
    undoHistory.push({ main: mainData, points: pointsData });
}

// ▼ 修正: Undo時に現在の状態をRedo履歴へ ▼
function undoLastAction() {
    if (undoHistory.length > 0) {
        // 現在の状態をRedo用に保存
        const currentMain = mainCanvas.toDataURL();
        const currentPoints = JSON.parse(JSON.stringify(pointsHistory));
        redoHistory.push({ main: currentMain, points: currentPoints });

        // Undo実行
        const stateToRestore = undoHistory.pop();
        pointsHistory = stateToRestore.points; 
        restoreCanvasState(stateToRestore.main, mainCtx);
    }
}

// ▼ 追加: Redo機能 ▼
function redoLastAction() {
    if (redoHistory.length > 0) {
        // 現在の状態をUndo用に保存（また戻れるように）
        const currentMain = mainCanvas.toDataURL();
        const currentPoints = JSON.parse(JSON.stringify(pointsHistory));
        undoHistory.push({ main: currentMain, points: currentPoints });

        // Redo実行
        const stateToRestore = redoHistory.pop();
        pointsHistory = stateToRestore.points;
        restoreCanvasState(stateToRestore.main, mainCtx);
    }
}

function saveStateToLocalStorage() {
    if (!confirm('現在の描画状態をPCに保存しますか？')) return;
    try {
        const mainData = mainCanvas.toDataURL();
        localStorage.setItem(STORAGE_KEY_MAIN, mainData);
        localStorage.setItem(STORAGE_KEY_POINTS, JSON.stringify(pointsHistory));
        alert('保存しました。');
    } catch (e) {
        alert('保存失敗: ' + e.message);
    }
}

function loadStateFromLocalStorage() {
    try {
        const mainData = localStorage.getItem(STORAGE_KEY_MAIN);
        const pointsData = localStorage.getItem(STORAGE_KEY_POINTS);
        if (!mainData) { alert('保存データがありません。'); return; }
        if (!confirm('保存データを読み込みますか？')) return;

        undoHistory = []; 
        redoHistory = []; // 読込時は履歴リセット
        pointsHistory = pointsData ? JSON.parse(pointsData) : [];
        
        redrawBgCanvas(); 
        restoreCanvasState(mainData, mainCtx);
        
        alert('読み込みました。');
    } catch (e) {
         alert('読込失敗: ' + e.message);
    }
}

function clearStateFromLocalStorage() {
    if (confirm('保存データを消去しますか？')) {
        localStorage.removeItem(STORAGE_KEY_MAIN);
        localStorage.removeItem(STORAGE_KEY_POINTS); 
        alert('消去しました。');
    }
}