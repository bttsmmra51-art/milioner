// ==========================================
// 1. بيانات اللاعبين والجلسة
// ==========================================

const playerData = {
    name: "لاعب",
    money: 1000,
    gems: 20,
    level: 1,
    heroName: "المغامر",
    heroLevel: 1,
    selectedCharacter: "sama",
    characterImage:  "/static/images/characters/character-sama.png",
    characterAvatar: "/static/images/characters/character-sama-id.png",
    characterName: "سما",
    isAdmin: false,
    characterPassives: [
        { icon: "🪽", name: "أجنحة الحرية", desc: "عند الحصول على ثلاثة أزواج متتالية من النرد، ينتقل اللاعب إلى بوابة العالم بنسبة 75% بدلاً من دخول المحطة السوداء" },
        { icon: "💼", name: "خدمة الضيوف", desc: "عند الوقوف على بوابة العالم، يحصل اللاعب على 100$ مضروبة في عدد الزيارات" }
    ]
};

const players = [
    { id: 0, name: "لاعب", money: 1000, position: 0, human: true,  alive: true, skipNextTurn: false, freeJailCard: false, airportPending: false, jailTurns: 0, airportVisits: 0, _usedPlanThisTurn: false },
    { id: 1, name: "أحمد", money: 1000, position: 0, human: false, alive: true, skipNextTurn: false, freeJailCard: false, airportPending: false, jailTurns: 0, airportVisits: 0, _usedPlanThisTurn: false },
    { id: 2, name: "محمد", money: 1000, position: 0, human: false, alive: true, skipNextTurn: false, freeJailCard: false, airportPending: false, jailTurns: 0, airportVisits: 0, _usedPlanThisTurn: false },
    { id: 3, name: "علي",  money: 1000, position: 0, human: false, alive: true, skipNextTurn: false, freeJailCard: false, airportPending: false, jailTurns: 0, airportVisits: 0, _usedPlanThisTurn: false }
];

let gameSession = {
    active: false, moving: false, currentPlayer: 0,
    consecutiveDoubles: 0, awaitingRoll: false, airportSelecting: false,
    doubleRentSelecting: false, doubleRentPlayer: null,
    doubleRentTimer: null, doubleRentIsDouble: false,
    freeUpgradeSelecting: false, freeUpgradePlayer: null,
    freeUpgradeTimer: null, freeUpgradeIsDouble: false
};

let startingOrder = [];
let timerInterval = null;
let rpsTimerInterval = null;
let buyTimerInterval = null;
let eventTimerInterval = null;

let gameMode = "1v1v1v1";
let activePlayerIds = [0, 1, 2, 3];
let teams = null;
let playModeType = "friends";

function getActivePlayers() {
    return activePlayerIds.map(id => players[id]).filter(p => p !== undefined);
}

// ==========================================
// 🔌 Socket.IO Setup
// ==========================================

const socket = io();

socket.on('connect', () => {
    console.log('🔌 Socket.IO connected, sid =', socket.id);
    if (typeof currentRoom !== 'undefined' && currentRoom && currentRoom.id) {
        socket.emit('join_room', { room_id: currentRoom.id });
    }
});

socket.on('disconnect', (reason) => {
    console.warn('🔌 Socket disconnected:', reason);
});

socket.on('connected', (data) => {
    console.log('✅ Server says:', data.message);
});
socket.on('user_info', (data) => {
    playerData.userId = data.user_id;
    console.log('👤 user_id =', data.user_id);
});

// ==========================================
// 🏠 Lobby Party listeners
// ==========================================
let currentParty = null;
let activeLobbyInvite = null;

socket.on('lobby:party_update', (data) => {
    console.log('🏠 lobby:party_update:', data);
    currentParty = data.party;
    renderPartyZone();
});

socket.on('lobby:closed', (data) => {
    console.log('🏠 lobby:closed:', data);
    currentParty = null;
    renderPartyZone();
});

socket.on('lobby:invite_received', (data) => {
    console.log('🏠 lobby:invite_received:', data);
    activeLobbyInvite = data;
    document.getElementById('lobby-invite-from').textContent = data.from.username;
    document.getElementById('lobby-invite-notification').classList.remove('hidden');
});

socket.on('lobby:invite_rejected', (data) => {
    console.log('🏠 invite rejected:', data);
    setMessage(`❌ ${data.by_username} رفض الدعوة`);
});

socket.on('lobby:error', (data) => {
    console.error('🏠 lobby error:', data);
    alert('⚠️ ' + (data.error || 'خطأ'));
});

// ==========================================
// 💬 Lobby Chat listeners
// ==========================================
let lobbyChatState = {
    open: false,
    messages: [],
};

socket.on('lobby:chat_message', (data) => {
    if (!currentParty) return;
    lobbyChatState.messages.push(data);
    if (lobbyChatState.messages.length > 100) lobbyChatState.messages.shift();

    if (lobbyChatState.open) {
        renderLobbyChatMessage(data);
    }
});

socket.on('lobby:chat_history', (data) => {
    if (!currentParty) return;
    lobbyChatState.messages = [];
    (data.messages || []).forEach(m => lobbyChatState.messages.push(m));

    const container = document.getElementById('lobby-chat-messages');
    if (container) {
        container.innerHTML = '';
        lobbyChatState.messages.forEach(renderLobbyChatMessage);
    }
});

socket.on('game:state', (data) => {
    console.log('🎮 game:state received', data);
    handleGameStateUpdate(data);
});

socket.on('game:dice_result', (data) => {
    console.log('🎲 game:dice_result:', data);
    handleServerDiceResult(data);
});

socket.on('game:money_events', (data) => {
    console.log('💰 game:money_events:', data);
    animateServerMoneyEvents(data.events);
});

socket.on('game:landing', (data) => {
    console.log('📍 game:landing:', data);
    handleServerLanding(data);
});

socket.on('game:chance_result', (data) => {
    console.log('🎴 game:chance_result:', data);
    handleServerChanceResult(data);
});
socket.on('game:passive_triggers', (data) => {
    console.log('✨ game:passive_triggers:', data);
    const triggers = data.triggers || [];
    triggers.forEach((t, i) => {
        setTimeout(() => {
            const playerIdx = t.player_idx;
            const icon = t.icon || "✨";
            const name = t.name || "";
            if (playerIdx !== undefined) {
                showPassiveActivation(playerIdx, icon, name);
            }
        }, i * 700);
    });
});
socket.on('game:plan_result', (data) => {
    console.log('📋 game:plan_result:', data);
    if (data.card) {
        showServerChanceCard(data.card);
    }
});
socket.on('game:free_upgrade_result', (data) => {
    console.log('🏠 game:free_upgrade_result:', data);
    if (data.tile_index !== undefined) {
        const tile = boardTiles[data.tile_index];
        if (tile) {
            tile.level = "building";
            updateTileVisual(data.tile_index);
        }
        setMessage(`🏠 تم ترقية ${data.tile_name} مجاناً!`);
    }
});
socket.on('game:airport_result', (data) => {
    console.log('✈️ game:airport_result:', data);

    const pidx = (data.player_idx !== undefined) ? data.player_idx : gameSession.currentPlayer;
    const current = players[pidx];

    if (!current || !data.animation_path || data.animation_path.length === 0) {
        socket.emit('game:animation_done', { room_id: currentRoom.id });
        return;
    }

    serverAnimating = true;
    gameSession.moving = true;

    animateWalkPath(current, data.animation_path).then(() => {
        serverAnimating = false;
        gameSession.moving = false;
        syncPlayersPositions(window.serverGame ? window.serverGame.players : []);
        socket.emit('game:animation_done', { room_id: currentRoom.id });
    });
});
socket.on('game:double_rent_result', (data) => {
    console.log('💵 game:double_rent_result:', data);
    if (data.doubled_tile_index !== undefined) {
        const tile = boardTiles[data.doubled_tile_index];
        if (tile) {
            tile.rentMultiplier = data.new_multiplier;
            updateTileVisual(data.doubled_tile_index);
        }
        setMessage(`💵 تم مضاعفة إيجار ${data.doubled_tile_name}`);
    }
});

socket.on('game:over', (data) => {
    console.log('🏆 game:over:', data);
    handleServerGameOver(data);
});

socket.on('game:error', (data) => {
    console.error('❌ game:error:', data);
    setMessage('⚠️ ' + (data.error || 'خطأ من السيرفر'));
    const rollBtn = document.getElementById("roll-dice-btn");
    if (rollBtn) rollBtn.disabled = false;
});
// ---- تحديث الغرفة لحظياً ----
socket.on('room_update', (data) => {
    console.log('📢 room_update:', data);
    if (!data || !data.room) return;

    currentRoom = data.room;
    const roomScreen = document.getElementById('room-screen');
    if (roomScreen.classList.contains('hidden')) {
        showRoomScreen();
    } else {
        renderRoom();
    }
    loadInvitableFriends();
});

socket.on('room_closed', () => {
    console.log('🚪 room_closed (silent)');
    currentRoom = null;
    const roomScreen = document.getElementById('room-screen');
    if (!roomScreen.classList.contains('hidden')) {
        hideRoomScreen();
    }
});
socket.on('game_started', (data) => {
    console.log('📢 game_started (legacy):', data);
});
socket.on('invite_received', (data) => {
    console.log('✉️ invite_received:', data);
    showInviteNotification({
        invite_id: data.invite_id,
        room_id: data.room_id,
        mode: data.mode,
        capacity: data.capacity,
        members_count: data.members_count,
        host: data.host
    });
});

socket.on('invite_cancelled', (data) => {
    console.log('❌ invite_cancelled:', data);
    if (activeInvite && activeInvite.invite_id === data.invite_id) {
        hideInviteNotification();
    }
});

// ==========================================
// 🎯 RPS events (server-authoritative)
// ==========================================
socket.on('game:rps_progress', (data) => {
    console.log('📊 RPS progress:', data);
    updateOnlineRPSProgress(data.chosen_count, data.total);
});

socket.on('game:rps_result', (data) => {
    console.log('🏆 RPS result:', data);
    showOnlineRPSResult(data);
});

socket.on('game:rps_tiebreak', (data) => {
    console.log('⚖️ RPS tiebreak:', data);
    showRpsTiebreak(data);
});

// ==========================================
// 🎲 Matchmaking State & Listeners
// ==========================================
let matchmakingState = {
    active: false,
    mode: null,
    pollInterval: null
};

socket.on('match_found', (data) => {
    console.log('🎯 match_found:', data);
    stopMatchmaking();
    serverGameInProgress = false;
    currentRoom = data.room;

    if (currentRoom && currentRoom.id) {
        socket.emit('join_room', { room_id: currentRoom.id });
    }

    hideAllScreens();
    showRoomScreen();
    startRoomPolling();
});
socket.on('matchmaking_status', (data) => {
    console.log('⏳ matchmaking_status:', data);
    if (!matchmakingState.active) return;
    updateMatchmakingUI(data.current, data.capacity);
});

// ==========================================
// ⏱️ Game Timer + 💬 Chat
// ==========================================
socket.on('game:timer_tick', (data) => {
    updateGameTimer(data.remaining, data.total);
});

socket.on('game:chat_message', (data) => {
    if (!currentRoom || !currentRoom.id) return;
    if (String(data.room_id) !== String(currentRoom.id)) return;

    // ✅ popup فوري
    showChatPopup(data);

    // ✅ وخزّن في الـ panel كمان
    appendChatMessage(data);

    // ✅ لو البانل مفتوح، اعرض
    if (chatState.open) {
        renderChatMessage(data);
    }
});
// ✅ جديد: تاريخ الشات
socket.on('game:chat_history', (data) => {
    if (!currentRoom || String(data.room_id) !== String(currentRoom.id)) return;
    chatState.messages = [];
    (data.messages || []).forEach(m => {
        chatState.messages.push(m);
    });
    // لو البانل مفتوح، امسح وارسم من الأول
    const container = document.getElementById('chat-messages');
    if (container) {
        container.innerHTML = '';
        chatState.messages.forEach(renderChatMessage);
    }
});
// ==========================================
// 🎲 Matchmaking Functions
// ==========================================
function hideAllScreens() {
    ['lobby-screen', 'play-type-screen', 'mode-screen',
     'room-screen', 'game-screen', 'matchmaking-screen',
     'characters-screen'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

async function startMatchmaking(mode) {
    matchmakingState.active = true;
    matchmakingState.mode = mode;

    hideAllScreens();
    document.getElementById('matchmaking-screen').classList.remove('hidden');
    document.getElementById('mm-mode-label').textContent = mode;
    updateMatchmakingUI(0, getModeCapacity(mode));

    try {
        const res = await apiCall('/api/matchmaking/join', 'POST', { mode });

        if (res.status === 'matched') {
            currentRoom = res.room;
            socket.emit('join_room', { room_id: currentRoom.id });
            stopMatchmaking();
            hideAllScreens();
            showRoomScreen();
            startRoomPolling();
            return;
        }

        updateMatchmakingUI(res.current, res.capacity);

        matchmakingState.pollInterval = setInterval(async () => {
            try {
                const s = await apiCall('/api/matchmaking/status');
                if (s.in_queue) {
                    updateMatchmakingUI(s.current, s.capacity);
                } else {
                    stopMatchmaking();
                }
            } catch (e) {
                console.error(e);
            }
        }, 3000);

    } catch (e) {
        alert(e.message || 'فشل الانضمام للبحث');
        stopMatchmaking();
        document.getElementById('mode-screen').classList.remove('hidden');
    }
}

function stopMatchmaking() {
    matchmakingState.active = false;
    if (matchmakingState.pollInterval) {
        clearInterval(matchmakingState.pollInterval);
        matchmakingState.pollInterval = null;
    }
}

function updateMatchmakingUI(current, capacity) {
    const curEl = document.getElementById('mm-current');
    const capEl = document.getElementById('mm-capacity');
    const barEl = document.getElementById('mm-bar-fill');
    if (curEl) curEl.textContent = current;
    if (capEl) capEl.textContent = capacity;
    if (barEl) {
        const pct = capacity > 0 ? Math.min(100, (current / capacity) * 100) : 0;
        barEl.style.width = pct + '%';
    }
}

function getModeCapacity(mode) {
    return { '1v1': 2, '1v1v1': 3, '1v1v1v1': 4, '2v2': 4 }[mode] || 4;
}

// ==========================================
// 🎮 Server Game Handlers
// ==========================================

let serverGameInProgress = false;
let serverAnimating = false;

// ✅ محدّث: فحص phase === 'rps'
function handleGameStateUpdate(data) {
    if (!data || !data.players) return;
    window.serverGame = data;

    // ✅ RPS phase — اعرض شاشة RPS بدل الخريطة
    if (data.phase === 'rps') {
        if (!players.length || !players[0] || !players[0].user_id) {
            rebuildPlayersFromServer(data.players);
        }
        handleRPSState(data);
        return;
    }

    // ✅ لو كنا في RPS وخلصنا — شيل شاشة RPS
    removeOnlineRPSScreen();

    const gameScreen = document.getElementById('game-screen');
    const isFirstTime = !serverGameInProgress;

    if (isFirstTime) {
        hideAllScreens();
        gameScreen.classList.remove('hidden');
        gameMode = data.mode;
        rebuildPlayersFromServer(data.players);
        createMap();
        serverGameInProgress = true;
        ensureChatUI();  // ✅ شات
    } else {
                updatePlayersBasicFromServer(data.players);
        syncPlayersPositions(data.players);
    }
    updateBoardFromServer(data.board);
    updateTurnFromServer(data);

    if (data.status === 'ended' && data.winner !== null) {
        handleServerGameOver({
            winner_user_id: data.winner,
            reason: data.ended_reason
        });
    }
}
function syncPlayersPositions(serverPlayers) {
    let changed = false;
    serverPlayers.forEach((sp, idx) => {
        const p = players[idx];
        if (!p) return;
        if (p.position !== sp.position) {
            p.position = sp.position;
            updateToken(p);
            changed = true;
        }
    });
    if (changed) {
        updateActiveToken();
        updatePlayersDisplay();
    }
}
function rebuildPlayersFromServer(serverPlayers) {
    players.length = 0;
    activePlayerIds = [];

    serverPlayers.forEach((sp, idx) => {
        const charInfo = charactersData.find(c => c.id === sp.character) || null;

        const isBot = sp.is_bot === true;
        const isMe = !isBot 
            && playerData.userId !== undefined 
            && playerData.userId !== null
            && String(sp.user_id) === String(playerData.userId);

        players[idx] = {
            id: idx,
            user_id: sp.user_id,
            name: sp.username,
            is_bot: isBot,
            bot_index: sp.bot_index,
            team_idx: sp.team_idx,
            money: sp.money,
            position: sp.position,
            human: isMe,
            alive: sp.alive,
            skipNextTurn: sp.skip_next_turn || false,
            freeJailCard: false,
            airportPending: sp.airport_pending || false,
            jailTurns: sp.jail_turns || 0,
            airportVisits: 0,
            _usedPlanThisTurn: false,
            character: sp.character || 'sama',
            characterImage: charInfo ? charInfo.image : null,
            characterAvatar: charInfo ? (charInfo.cardImage || charInfo.image) : null,
            characterName: charInfo ? charInfo.name : sp.username,
        };
        activePlayerIds.push(idx);
    });

    console.log('🔍 players rebuilt:', players.map(p => ({
        name: p.name, human: p.human, is_bot: p.is_bot, team: p.team_idx
    })));
}
function updatePlayersBasicFromServer(serverPlayers) {
    serverPlayers.forEach((sp, idx) => {
        const p = players[idx];
        if (!p) return;
        p.money = sp.money;
        p.alive = sp.alive;
        p.jailTurns = sp.jail_turns || 0;
        if (!serverAnimating && !gameSession.moving) {
            p.position = sp.position;
        }
    });
    updatePlayersDisplay();
    players.forEach(p => { if (p) updateToken(p); });
}
function updateBoardFromServer(serverBoard) {
    if (!serverBoard) return;
    serverBoard.forEach((sbt) => {
        const tile = boardTiles[sbt.index];
        if (!tile) return;

        tile.owner = sbt.owner;
        tile.ownerTeamIdx = sbt.owner_team_idx;
        tile.level = sbt.level;
        if (tile.type === "property") tile.rentMultiplier = sbt.rent_multiplier || 1;
        updateTileVisual(sbt.index);
    });
}
function updateTurnFromServer(data) {
    gameSession.currentPlayer = data.current_turn_idx;
    gameSession.active = (data.status === 'playing');
    gameSession.awaitingRoll = data.awaiting_roll;

    const current = players[data.current_turn_idx];
    if (!current) return;

    const turnName = document.getElementById("current-turn-name");
    const rollBtn = document.getElementById("roll-dice-btn");

    updatePlayersDisplay();
    updateActiveToken();
    stopTimer();

    if (current.alive === false) {
        if (rollBtn) rollBtn.disabled = true;
        return;
    }

    const myIdx = players.findIndex(p => p && p.human);
    const isMyTurn = (data.current_turn_idx === myIdx);

    const serverCurrentPlayer = data.players && data.players[data.current_turn_idx];
    const currentJailTurns = serverCurrentPlayer ? (serverCurrentPlayer.jail_turns || 0) : 0;

    if (currentJailTurns > 0) {
        if (rollBtn) rollBtn.disabled = true;
        if (turnName && serverCurrentPlayer) {
            turnName.textContent = `${serverCurrentPlayer.username} في المحطة السوداء (${currentJailTurns})`;
        }
        serverAnimating = false;
        gameSession.moving = false;
        return;
    }

    if (data.awaiting_roll && isMyTurn) {
        serverAnimating = false;
        gameSession.moving = false;
        if (rollBtn) rollBtn.disabled = false;
        if (turnName) turnName.textContent = "دور " + current.name;

        startTimer(20, () => {
            if (window.serverGame && window.serverGame.awaiting_roll && currentRoom) {
                socket.emit('game:roll', { room_id: currentRoom.id });
            }
        });
        return;
    }

    if (rollBtn) rollBtn.disabled = true;
    if (turnName) {
        if (data.awaiting_roll) {
            turnName.textContent = "دور " + current.name;
        } else if (data.awaiting_decision) {
            turnName.textContent = "قرار معلق...";
        } else {
            turnName.textContent = "دور " + current.name;
        }
    }
}
async function handleServerDiceResult(data) {
    const el1 = document.getElementById("dice-one");
    const el2 = document.getElementById("dice-two");
    if (el1) el1.textContent = data.d1;
    if (el2) el2.textContent = data.d2;

    let msg = `${data.player_username} رمى ${data.d1} + ${data.d2}`;
    if (data.dice_multiplier === 2) msg += ` ×2 = ${data.total}`;
    else msg += ` = ${data.total}`;
    setMessage(msg);

    if (data.passive_triggers && data.passive_triggers.length) {
        data.passive_triggers.forEach((t, i) => {
            setTimeout(() => {
                if (t.player_idx !== undefined) {
                    showPassiveActivation(t.player_idx, t.icon || "✨", t.name || "");
                }
            }, i * 700);
        });
    }

    if (data.event === "sama_wings" || data.event === "three_doubles_jail") {
        serverAnimating = false;
        gameSession.moving = false;
        return;
    }

    const player = players[data.player_index];
    if (!player) {
        socket.emit('game:animation_done', { room_id: currentRoom.id });
        return;
    }

    gameSession.moving = true;
    serverAnimating = true;

    const safetyTimeout = setTimeout(() => {
        if (serverAnimating) {
            serverAnimating = false;
            gameSession.moving = false;
        }
    }, 15000);

    try {
        await animateWalkPath(player, data.path || []);
    } catch (e) {
        console.error('❌ Animation error:', e);
    }

    clearTimeout(safetyTimeout);
    serverAnimating = false;
    gameSession.moving = false;

    socket.emit('game:animation_done', { room_id: currentRoom.id });

    if (window.serverGame && window.serverGame.players) {
        syncPlayersPositions(window.serverGame.players);
    }
    if (window.serverGame) {
        updateTurnFromServer(window.serverGame);
    }

    setTimeout(() => {
        if (window.serverGame && window.serverGame.players) {
            syncPlayersPositions(window.serverGame.players);
        }
    }, 500);
}
function animateWalkPath(player, path) {
    return new Promise((resolve) => {
        if (!path || path.length === 0) {
            resolve();
            return;
        }
        let i = 0;
        const step = () => {
            if (i >= path.length) {
                resolve();
                return;
            }
            player.position = path[i];
            updateToken(player);
            updateActiveToken();
            i++;
            setTimeout(step, 280);
        };
        step();
    });
}
// زر إلغاء البحث
document.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('mm-cancel-btn');
    if (cancelBtn) {
        cancelBtn.onclick = async () => {
            try {
                await apiCall('/api/matchmaking/leave', 'POST');
            } catch (e) {
                console.error(e);
            }
            stopMatchmaking();
            hideAllScreens();
            document.getElementById('play-type-screen').classList.remove('hidden');
        };
    }
});

function getPlayerIndexByUserId(userId) {
    return players.findIndex(p => p && p.user_id === userId);
}

function animateServerMoneyEvents(events) {
    if (!events || !events.length) {
        console.log('💰 animateServerMoneyEvents: no events');
        return;
    }
    console.log('💰 animateServerMoneyEvents:', JSON.stringify(events));

    events.forEach((ev, evIdx) => {
        const amount = Number(ev.amount) || 0;
        if (amount <= 0) return;

        let fromIdx = null;
        let toIdx = null;

        if (ev.from_is_bank) {
            fromIdx = "bank";
        } else if (ev.from_user_id !== null && ev.from_user_id !== undefined) {
            fromIdx = players.findIndex(p => p && String(p.user_id) === String(ev.from_user_id));
        } else {
            fromIdx = "bank";
        }

        if (ev.to_is_bank) {
            toIdx = "bank";
        } else if (ev.to_user_id !== null && ev.to_user_id !== undefined) {
            toIdx = players.findIndex(p => p && String(p.user_id) === String(ev.to_user_id));
        } else {
            toIdx = "bank";
        }

        const fromAnim = (typeof fromIdx === "number" && fromIdx >= 0) ? fromIdx : null;
        const toAnim = (typeof toIdx === "number" && toIdx >= 0) ? toIdx : null;

        console.log(`   💸 #${evIdx}: from=${fromIdx}, to=${toIdx}, amount=${amount}`);

        setTimeout(() => {
            if (fromAnim === null && toAnim === null) return;
            animateMoneyTransfer(fromAnim, toAnim, amount, () => {
                if (fromAnim !== null) showFloatingMoney(fromAnim, -amount);
                if (toAnim !== null) showFloatingMoney(toAnim, amount);
            });
        }, evIdx * 150);
    });
}
function requestNextTurn() {
    // ✅ No-op
}
function handleServerLanding(data) {
    const player = players[data.player_idx];
    if (!player) return;
    if (data.money_events && data.money_events.length) {
        animateServerMoneyEvents(data.money_events);
    }

    const event = data.event;

    if (event === "nothing") {
        setMessage(data.message || `${player.name} على ${data.tile_name}`);
        return;
    }

    if (event === "money_gain" || event === "chest") {
        setMessage(`${player.name} حصل على ${data.amount}$ من ${data.tile_name}`);
        return;
    }

    if (event === "rent") {
        setMessage(`${player.name} دفع ${data.rent}$ لـ ${data.owner_username}`);
        return;
    }

    if (event === "buy_offer") {
        if (player.human) {
            showServerBuyDialog(player, data);
        } else {
            socket.emit('game:decision', { room_id: currentRoom.id, action: 'skip' });
        }
        return;
    }

    if (event === "upgrade_offer") {
        if (player.human) {
            showServerUpgradeDialog(player, data);
        } else {
            socket.emit('game:decision', { room_id: currentRoom.id, action: 'skip' });
        }
        return;
    }

    if (event === "steal_offer") {
        if (player.human) {
            showServerStealDialog(player, data);
        } else {
            socket.emit('game:decision', { room_id: currentRoom.id, action: 'skip' });
        }
        return;
    }

    if (event === "chance") {
        showServerChanceCard(data.card);
        return;
    }

    if (event === "plan_offer") {
        if (player.human) {
            showServerPlanDialog(player, data.card);
        } else {
            socket.emit('game:plan_choice', { room_id: currentRoom.id, accept: true });
        }
        return;
    }

    if (event === "jail") {
        if (player.human) {
            showEventCard("توقف", "المحطة السوداء!", `${player.name} دخل المحطة`, "#3a3a42", () => {});
        }
        return;
    }

    if (event === "airport_offer") {
        if (player.human) {
            showServerAirportDialog(player);
        } else {
            const props = boardTiles.map((t, i) => ({t, i})).filter(o =>
                o.t.type === "property" && o.t.owner === null
            );
            let pick = props.length ? props[0].i : 0;
            let best = -1;
            props.forEach(o => { if (o.t.price > best) { best = o.t.price; pick = o.i; }});
            socket.emit('game:airport_choice', { room_id: currentRoom.id, tile_index: pick });
        }
        return;
    }
    if (event === "free_upgrade_offer") {
        if (player.human) {
            showServerFreeUpgradeDialog(player, data.owned_indices || []);
        } else {
            const owned = (data.owned_indices || []);
            if (owned.length === 0) {
                socket.emit('game:decision', { room_id: currentRoom.id, action: 'skip' });
            } else {
                socket.emit('game:free_upgrade_choice', { room_id: currentRoom.id, tile_index: owned[0] });
            }
        }
        return;
    }
    if (event === "double_rent_offer") {
        if (player.human) {
            showServerDoubleRentDialog(player, data.owned_indices || []);
        } else {
            const owned = (data.owned_indices || []).map(i => boardTiles[i]).filter(Boolean);
            if (owned.length === 0) {
                socket.emit('game:decision', { room_id: currentRoom.id, action: 'skip' });
                return;
            }
            const best = owned.reduce((a, b) => (a.rent > b.rent ? a : b));
            const idx = boardTiles.indexOf(best);
            socket.emit('game:double_rent_choice', { room_id: currentRoom.id, tile_index: idx });
        }
        return;
    }

    if (event === "bankrupt") {
        setMessage(`${player.name} أفلس!`);
        return;
    }
}
// ---------- Server Buy Dialog ----------
function showServerBuyDialog(player, data) {
    const old = document.getElementById("buy-dialog");
    if (old) old.remove();

    const tile = boardTiles[data.tile_index];
    const dialog = document.createElement("div");
    dialog.id = "buy-dialog";
    dialog.style.cssText = `position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.85) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; direction: rtl !important; font-family: Arial, sans-serif !important;`;

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 2px solid #d6a928; border-radius: 20px; padding: 25px 30px; min-width: 260px; max-width: 380px; width: 100%; text-align: center; color: #fff;">
            <div style="font-size: 24px; font-weight: 900; color: #ffd84d; margin-bottom: 15px;">${tile.name}</div>
            <div style="color: #ccc; font-size: 16px; margin: 8px 0;">السعر: <b>${data.price}$</b></div>
            <div style="color: #888; font-size: 14px; margin: 8px 0;">رصيدك: <b style="color:#4dff88;">${player.money}$</b></div>
            <div id="buy-timer" style="font-size: 30px; font-weight: 900; color: #ff4d4d; margin: 15px 0;">15</div>
            <div style="display: flex; gap: 12px; margin-top: 15px;">
                <button id="buy-yes-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4dff88, #1eaa55); color: #0d0919; font-family: inherit;">اشتري</button>
                <button id="buy-no-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #ff6b6b, #aa1e1e); color: #fff; font-family: inherit;">تخطي</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    let closed = false, remaining = 15;
    const timerEl = document.getElementById("buy-timer");

    const send = (action) => {
        if (closed) return;
        closed = true;
        if (buyTimerInterval) { clearInterval(buyTimerInterval); buyTimerInterval = null; }
        dialog.remove();
        socket.emit('game:decision', {
            room_id: currentRoom.id,
            action: action,
            tile_index: data.tile_index
        });
    };

    document.getElementById("buy-yes-btn").onclick = () => send('buy');
    document.getElementById("buy-no-btn").onclick = () => send('skip');

    buyTimerInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) send('skip');
    }, 1000);
}

// ---------- Server Upgrade Dialog ----------
function showServerUpgradeDialog(player, data) {
    const old = document.getElementById("upgrade-dialog");
    if (old) old.remove();

    const tile = boardTiles[data.tile_index];
    const dialog = document.createElement("div");
    dialog.id = "upgrade-dialog";
    dialog.style.cssText = `position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.85) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; direction: rtl !important; font-family: Arial, sans-serif !important;`;

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 2px solid #4dff88; border-radius: 20px; padding: 25px 30px; min-width: 280px; max-width: 400px; width: 100%; text-align: center; color: #fff;">
            <div style="font-size: 24px; font-weight: 900; color: #4dff88; margin-bottom: 15px;">ترقية المبنى</div>
            <div style="font-size: 20px; font-weight: 900; color: #ffd84d; margin-bottom: 15px;">${tile.name}</div>
            <div style="color: #ccc; font-size: 16px; margin: 8px 0;">التكلفة: <b>${data.price}$</b></div>
            <div style="color: #888; font-size: 14px; margin: 8px 0;">رصيدك: <b style="color:#4dff88;">${player.money}$</b></div>
            <div id="upgrade-timer" style="font-size: 30px; font-weight: 900; color: #ff4d4d; margin: 15px 0;">15</div>
            <div style="display: flex; gap: 12px; margin-top: 15px;">
                <button id="upgrade-yes-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4dff88, #1eaa55); color: #0d0919; font-family: inherit;">طوّر</button>
                <button id="upgrade-no-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #666, #333); color: #fff; font-family: inherit;">تخطي</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    let closed = false, remaining = 15;
    const timerEl = document.getElementById("upgrade-timer");
    let interval;

    const send = (action) => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        dialog.remove();
        socket.emit('game:decision', {
            room_id: currentRoom.id,
            action: action,
            tile_index: data.tile_index
        });
    };

    document.getElementById("upgrade-yes-btn").onclick = () => send('upgrade');
    document.getElementById("upgrade-no-btn").onclick = () => send('skip');

    interval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) send('skip');
    }, 1000);
}

// ---------- Server Steal Dialog ----------
function showServerStealDialog(player, data) {
    const old = document.getElementById("steal-dialog");
    if (old) old.remove();

    const tile = boardTiles[data.tile_index];
    const dialog = document.createElement("div");
    dialog.id = "steal-dialog";
    dialog.style.cssText = `position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.85) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; direction: rtl !important; font-family: Arial, sans-serif !important;`;

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 2px solid #ffd84d; border-radius: 20px; padding: 25px 30px; min-width: 280px; max-width: 400px; width: 100%; text-align: center; color: #fff;">
            <div style="font-size: 24px; font-weight: 900; color: #ffd84d; margin-bottom: 15px;">عرض شراء</div>
            <div style="font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 10px;">${tile.name}</div>
            <div style="color: #ccc; font-size: 16px; margin: 12px 0; padding: 10px; background: rgba(255,216,77,0.1); border-radius: 10px;">
                السعر: <b style="color: #ffd84d; font-size: 20px;">${data.steal_price}$</b>
            </div>
            <div style="color: #888; font-size: 14px; margin: 8px 0;">رصيدك: <b style="color:#4dff88;">${player.money}$</b></div>
            <div id="steal-timer" style="font-size: 30px; font-weight: 900; color: #ff4d4d; margin: 15px 0;">15</div>
            <div style="display: flex; gap: 12px; margin-top: 15px;">
                <button id="steal-yes-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #ffd84d, #d6a928); color: #0d0919; font-family: inherit;">اشتري</button>
                <button id="steal-no-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #666, #333); color: #fff; font-family: inherit;">تخطي</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    let closed = false, remaining = 15;
    const timerEl = document.getElementById("steal-timer");
    let interval;

    const send = (action) => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        dialog.remove();
        socket.emit('game:decision', {
            room_id: currentRoom.id,
            action: action,
            tile_index: data.tile_index
        });
    };

    document.getElementById("steal-yes-btn").onclick = () => send('steal');
    document.getElementById("steal-no-btn").onclick = () => send('skip');

    interval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) send('skip');
    }, 1000);
}

// ---------- Server Chance Card ----------
function showServerChanceCard(card) {
    const old = document.getElementById("chance-card-modal");
    if (old) old.remove();
    if (eventTimerInterval) { clearInterval(eventTimerInterval); eventTimerInterval = null; }

    const typeLabels = {
        reward: "✨ مكافأة", loss: "⚠️ خسارة", move: "🚶 حركة",
        strategic: "📌 استراتيجية", interactive: "🔀 تفاعلي", info: "ℹ️"
    };
    const typeIcons = {
        reward: "🎁", loss: "💀", move: "➡️",
        strategic: "📌", interactive: "👥", info: "ℹ️"
    };

    const modal = document.createElement("div");
    modal.id = "chance-card-modal";
    modal.className = "chance-card-modal";
    modal.innerHTML = `
        <div class="chance-card-wrapper">
            <div class="chance-card-player-header">
                <div class="hdr-icon">🎲</div>
                <div class="hdr-text">حظ</div>
            </div>
            <div class="chance-card type-${card.type || 'move'}">
                <div class="chance-card-badge">${typeLabels[card.type] || "🎴 بطاقة"}</div>
                <div class="chance-card-type-icon">${typeIcons[card.type] || "🎴"}</div>
                <div class="chance-card-image-area">
                    <div class="card-emoji">${card.icon}</div>
                </div>
                <div class="chance-card-name">${card.name}</div>
                <div class="chance-card-divider"></div>
                <div class="chance-card-text">${card.text}</div>
                <button class="chance-card-btn" type="button" id="chance-card-continue">متابعة</button>
                <div class="chance-card-timer" id="chance-card-timer">متابعة تلقائية خلال 15 ثانية</div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    let remaining = 15, closed = false;
    const timerEl = document.getElementById("chance-card-timer");

    const send = () => {
        if (closed) return;
        closed = true;
        if (eventTimerInterval) { clearInterval(eventTimerInterval); eventTimerInterval = null; }
        modal.style.opacity = "0";
        modal.style.transition = "opacity 0.3s";
        setTimeout(() => {
            if (modal.parentNode) modal.remove();
            socket.emit('game:chance_continue', { room_id: currentRoom.id });
        }, 300);
    };

    document.getElementById("chance-card-continue").onclick = send;

    eventTimerInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `متابعة تلقائية خلال ${remaining} ثانية`;
        if (remaining <= 0) send();
    }, 1000);
}

// ---------- Server Chance Result ----------
async function handleServerChanceResult(data) {
    const targetIdx = (data.player_idx !== undefined) ? data.player_idx : gameSession.currentPlayer;
    const current = players[targetIdx];
    if (!current) return;

    if (data.money_events && data.money_events.length) {
        animateServerMoneyEvents(data.money_events);
    }

    if (data.animation_path && data.animation_path.length > 0) {
        serverAnimating = true;
        gameSession.moving = true;
        await animateWalkPath(current, data.animation_path);
        serverAnimating = false;
        gameSession.moving = false;
        socket.emit('game:animation_done', { room_id: currentRoom.id });
        return;
    }

    if (data.extra && data.extra.teleport_to !== undefined) {
        current.position = data.extra.teleport_to;
        players.forEach(p => { if (p) updateToken(p); });
        updateActiveToken();
        updatePlayersDisplay();
    }
    if (data.extra && data.extra.doubled_count !== undefined) {
        setMessage(`تم مضاعفة إيجار ${data.extra.doubled_count} عقار`);
    }

    setTimeout(() => {
        socket.emit('game:animation_done', { room_id: currentRoom.id });
    }, 800);
}
// ---------- Server Game Over ----------
function handleServerGameOver(data) {
    gameSession.active = false;
    serverGameInProgress = false;
    stopTimer();
    removeGameTimer();   // ✅
    removeChatUI();      // ✅
    const winnerIdx = getPlayerIndexByUserId(data.winner_user_id);
    const winnerName = winnerIdx !== -1 ? players[winnerIdx].name : "?";

    setMessage(`🏆 ${winnerName} فاز! (${data.reason || ''})`);

    setTimeout(() => {
        alert(`🏆 ${winnerName} فاز باللعبة!\n${data.reason || ''}`);
    }, 500);
}

// ==========================================
// 🎯 Online RPS (Server-Authoritative)
// ==========================================

const onlineRPSState = {
    active: false,
    myChoice: null,
    chosenCount: 0,
    total: 0,
};

function handleRPSState(data) {
    let screen = document.getElementById('online-rps-screen');

    // ✅ لو جايين من تعادل → ما نعملش reset
    if (screen && screen.dataset.tiebreak === '1') {
        delete screen.dataset.tiebreak;
        const rps = data.rps || {};
        updateOnlineRPSProgress(rps.chosen_count || 0, rps.total || 0);
        return;
    }

    if (!screen) {
        // إخفاء كل الشاشات
        ['lobby-screen', 'play-type-screen', 'mode-screen',
         'room-screen', 'game-screen', 'matchmaking-screen',
         'characters-screen'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        screen = document.createElement('div');
        screen.id = 'online-rps-screen';
        screen.className = 'rps-screen';
        document.body.appendChild(screen);

        onlineRPSState.active = true;
        onlineRPSState.myChoice = null;

        renderOnlineRPSMain();
    }

    const rps = data.rps || {};
    onlineRPSState.chosenCount = rps.chosen_count || 0;
    onlineRPSState.total = rps.total || 0;
    updateOnlineRPSProgress(onlineRPSState.chosenCount, onlineRPSState.total);
}
function renderOnlineRPSMain() {
    const screen = document.getElementById('online-rps-screen');
    if (!screen) return;

    screen.innerHTML = `
        <div class="rps-panel">
            <div class="rps-title">حجر - ورقة - مقص</div>
            <div class="rps-match-title">اختر الآن — كل اللاعبين يلعبون معاً</div>
            <div id="rps-online-progress" class="rps-message">
                <span id="rps-online-count">0</span> / <span id="rps-online-total">0</span> اختاروا
            </div>
            <div id="rps-online-choices" class="rps-choices">
                <button class="rps-choice" data-choice="rock"><span>✊</span><small>حجر</small></button>
                <button class="rps-choice" data-choice="paper"><span>✋</span><small>ورقة</small></button>
                <button class="rps-choice" data-choice="scissors"><span>✌️</span><small>مقص</small></button>
            </div>
            <div id="rps-online-status" class="rps-message"></div>
        </div>
    `;

    screen.querySelectorAll('.rps-choice').forEach(btn => {
        btn.onclick = () => sendRPSChoice(btn.dataset.choice);
    });
}

function sendRPSChoice(choice) {
    if (!currentRoom || !socket || onlineRPSState.myChoice) return;

    onlineRPSState.myChoice = choice;
    socket.emit('game:rps_choice', {
        room_id: currentRoom.id,
        choice: choice,
    });

    const icons = { rock: '✊', paper: '✋', scissors: '✌️' };
    const statusEl = document.getElementById('rps-online-status');
    if (statusEl) {
        statusEl.textContent = `اخترت ${icons[choice]} — في انتظار باقي اللاعبين...`;
    }

    document.querySelectorAll('.rps-choice').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.4';
    });

    const chosenBtn = document.querySelector(`.rps-choice[data-choice="${choice}"]`);
    if (chosenBtn) {
        chosenBtn.style.opacity = '1';
        chosenBtn.style.transform = 'scale(1.15)';
    }
}

function updateOnlineRPSProgress(chosen, total) {
    const countEl = document.getElementById('rps-online-count');
    const totalEl = document.getElementById('rps-online-total');
    if (countEl) countEl.textContent = chosen;
    if (totalEl) totalEl.textContent = total;
}

function showOnlineRPSResult(data) {
    const screen = document.getElementById('online-rps-screen');
    if (!screen) return;

    const order = (data.result && data.result.order) || [];
    const myUserId = playerData.userId;
    const icons = { rock: '✊', paper: '✋', scissors: '✌️' };

    screen.innerHTML = `
        <div class="rps-panel">
            <h2 class="rps-title">نتيجة حجر ورقة مقص</h2>
            <div style="color:#8a6d1f; font-size:16px; font-weight:900; margin-bottom:15px;">
                ترتيب البداية
            </div>
            <div class="starting-order">
                ${order.map((p, i) => {
                    const isMe = String(p.user_id) === String(myUserId);
                    return `
                        <div class="starting-place ${i === 0 ? 'first-place' : ''}">
                            <div class="place-number">${i + 1}</div>
                            <div style="flex:1;">
                                ${icons[p.choice] || ''}
                                <b>${p.username}</b>
                                ${isMe ? ' <span style="color:#4dff88;">(أنت)</span>' : ''}
                                ${p.is_bot ? ' 🤖' : ''}
                            </div>
                            <div style="color:#8a6d1f; font-size:13px; font-weight:900;">
                                ${p.score} فوز
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="starting-message" style="margin-top:20px;">
                ⏳ اللعبة ستبدأ خلال ثوانٍ...
            </div>
        </div>
    `;
}
 
function showRpsTiebreak(data) {
    const screen = document.getElementById('online-rps-screen');
    if (!screen) return;

    screen.dataset.tiebreak = '1';

    const tiedIds = data.tied_ids || [];
    const myId = String(playerData.userId);
    const isTied = tiedIds.some(id => String(id) === myId);

    const tiedNames = tiedIds.map(uid => {
        const p = players.find(x => x && String(x.user_id) === String(uid));
        return p ? p.name : `#${uid}`;
    }).join(' - ');

    onlineRPSState.myChoice = null;
    onlineRPSState.chosenCount = 0;
    onlineRPSState.total = tiedIds.length;

    screen.innerHTML = `
        <div class="rps-panel">
            <div class="rps-title">⚖️ تعادل! جولة ${data.round || 2}</div>
            <div class="rps-match-title" style="color:#ff6b6b;">المتنافسون: ${escapeHtml(tiedNames)}</div>
            <div id="rps-online-progress" class="rps-message">
                <span id="rps-online-count">0</span> / <span id="rps-online-total">${tiedIds.length}</span> اختاروا
            </div>
            ${isTied ? `
                <div id="rps-online-choices" class="rps-choices">
                    <button class="rps-choice" data-choice="rock"><span>✊</span><small>حجر</small></button>
                    <button class="rps-choice" data-choice="paper"><span>✋</span><small>ورقة</small></button>
                    <button class="rps-choice" data-choice="scissors"><span>✌️</span><small>مقص</small></button>
                </div>
            ` : `
                <div class="rps-message" style="font-size:16px; color:#ffd84d;">
                    ⏳ في انتظار المتنافسين...
                </div>
            `}
            <div id="rps-online-status" class="rps-message"></div>
        </div>
    `;

    if (isTied) {
        screen.querySelectorAll('.rps-choice').forEach(btn => {
            btn.onclick = () => sendRPSChoice(btn.dataset.choice);
        });
    }
}
function removeOnlineRPSScreen() {
    const screen = document.getElementById('online-rps-screen');
    if (screen) screen.remove();
    onlineRPSState.active = false;
    onlineRPSState.myChoice = null;
    onlineRPSState.chosenCount = 0;
    onlineRPSState.total = 0;
}

// ==========================================
// 🌐 نظام الحسابات
// ==========================================

async function loadPlayerDataFromServer() {
    try {
        const res = await fetch('/api/me');
        if (!res.ok) { window.location.href = '/login'; return false; }
        const data = await res.json();

        playerData.name = data.username || 'لاعب';
        playerData.money = data.money ?? 1000;
        playerData.gems = data.gems ?? 20;
        playerData.level = data.level ?? 1;
        playerData.selectedCharacter = data.selected_character || 'sama';
        playerData.isAdmin = data.is_admin || false;

        const selectedChar = charactersData.find(c => c.id === playerData.selectedCharacter);
        if (selectedChar) {
            playerData.characterName   = selectedChar.name;
            playerData.characterImage  = selectedChar.image || null;
            playerData.characterAvatar = selectedChar.cardImage || selectedChar.image || null;
            playerData.characterPassives = selectedChar.passives || [];
        }

        if (Array.isArray(data.unlocked_characters)) {
            charactersData.forEach(c => {
                c.unlocked = data.unlocked_characters.includes(c.id);
            });
        }

        players[0].name = playerData.name;
        players[0].money = playerData.money;
        return true;
    } catch (err) {
        console.error('❌ فشل تحميل البيانات:', err);
        return false;
    }
}
// ==========================================
// 🏠 Party Zone Rendering
// ==========================================
let _myOriginalHeroImg = null;

function _saveOriginalHero() {
    if (_myOriginalHeroImg !== null) return;
    const avatarSrc = playerData.characterAvatar || playerData.characterImage;
    _myOriginalHeroImg = avatarSrc || null;
}

function setHeroCharacter(member, isMe) {
    const heroEl = document.getElementById('hero-image');
    if (!heroEl) return;

    const charInfo = charactersData.find(c => c.id === member.character);
    const imgSrc = charInfo ? (charInfo.cardImage || charInfo.image) : null;

    if (!imgSrc) {
        heroEl.innerHTML = '';
        return;
    }

    // ✅ لو أنا الليدر → استخدم صورتي الأصلية
    if (isMe) {
        _saveOriginalHero();
        const mySrc = _myOriginalHeroImg || imgSrc;
        heroEl.innerHTML = `<img src="${mySrc}" alt="${member.username}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
    } else {
        // ✅ الليدر حد تاني → اعرض صورته
        heroEl.innerHTML = `<img src="${imgSrc}" alt="${member.username}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
    }
}

function restoreHeroAsSelf() {
    const heroEl = document.getElementById('hero-image');
    if (!heroEl) return;
    _saveOriginalHero();
    if (_myOriginalHeroImg) {
        heroEl.innerHTML = `<img src="${_myOriginalHeroImg}" alt="${playerData.characterName || ''}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
    }
}

function renderPartyChar(el, member, isMe, isLeader) {
    const charInfo = charactersData.find(c => c.id === member.character);
    const imgSrc = charInfo ? (charInfo.cardImage || charInfo.image) : null;

    const img = el.querySelector('.party-char-img');
    const nameEl = el.querySelector('.party-char-name');

    if (img) {
        if (imgSrc) {
            img.src = imgSrc;
            img.alt = member.username;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    }

    if (nameEl) nameEl.textContent = member.username;

    // ✅ شارة "أنا"
    el.classList.toggle('is-me', isMe);
    // ✅ شارة الليدر
    el.classList.toggle('is-leader', isLeader);
}

function renderPartyZone() {
    const zone = document.getElementById('party-zone');
    const bottomSlot = document.getElementById('party-slot-bottom');
    const charArea = document.getElementById('character-area');
    const heroBadge = document.getElementById('hero-leader-badge');
    if (!zone) return;
    if (!currentParty || !currentParty.members || currentParty.members.length <= 1) {
        zone.classList.add('hidden');
        if (bottomSlot) bottomSlot.classList.add('hidden');
        if (charArea) charArea.classList.remove('party-active');
        if (heroBadge) heroBadge.classList.add('hidden');
        document.querySelectorAll('.party-char').forEach(el => el.classList.add('hidden'));
        restoreHeroAsSelf();

        const leaveBtn = document.getElementById('leave-party-btn');
        if (leaveBtn) leaveBtn.classList.add('hidden');

        // ✅ اخفي زر شات المجموعة
        const chatBtn = document.getElementById('lobby-chat-btn');
        if (chatBtn) chatBtn.classList.add('hidden');
        const chatPanel = document.getElementById('lobby-chat-panel');
        if (chatPanel) chatPanel.classList.add('hidden');
        lobbyChatState.open = false;

        // ✅ رجّع زر اللعب
        updatePlayButtonForLeader();

        return;
    }
    // ✅ الحالة الافتراضية: solo (مافيش party)
    if (!currentParty || !currentParty.members || currentParty.members.length <= 1) {
        zone.classList.add('hidden');
        if (bottomSlot) bottomSlot.classList.add('hidden');
        if (charArea) charArea.classList.remove('party-active');
        if (heroBadge) heroBadge.classList.add('hidden');
        document.querySelectorAll('.party-char').forEach(el => el.classList.add('hidden'));
        restoreHeroAsSelf();

        const leaveBtn = document.getElementById('leave-party-btn');
        if (leaveBtn) leaveBtn.classList.add('hidden');
        return;
    }

    zone.classList.remove('hidden');
    if (charArea) charArea.classList.add('party-active');

    const myId = String(playerData.userId);
    const members = currentParty.members;

    // ✅ الليدر = أول واحد في القايمة (السيرفر بيرتب كده)
    const leader = members[0];
    const leaderIsMe = String(leader.id) === myId;

    // ✅ الليدر دايماً في النص (hero-image)
    setHeroCharacter(leader, leaderIsMe);

    // ✅ شارة crown للـ hero
    if (heroBadge) {
        // crown يظهر دايماً لما يكون فيه party (الليدر في النص)
        heroBadge.classList.remove('hidden');
    }

    // ✅ الباقي في slots (ما عدا الليدر)
    const others = members.filter(m => String(m.id) !== String(leader.id));

    const roles = ['left', 'right', 'bottom'];
    roles.forEach((role, idx) => {
        const el = document.querySelector(`.party-char[data-role="${role}"]`);
        if (!el) return;

        const member = others[idx];
        if (!member) {
            el.classList.add('hidden');
            return;
        }

        const isMe = String(member.id) === myId;
        renderPartyChar(el, member, isMe, false);
        el.classList.remove('hidden');
    });

    // ✅ slot الأصدقاء الجانبيين حسب العدد
    if (others.length >= 1) {
        zone.classList.remove('hidden');
    }

    if (others.length >= 3) {
        if (bottomSlot) bottomSlot.classList.remove('hidden');
    } else {
        if (bottomSlot) bottomSlot.classList.add('hidden');
    }
    // ✅ زر شات المجموعة
    const chatBtn = document.getElementById('lobby-chat-btn');
    if (chatBtn) chatBtn.classList.remove('hidden');

    // ✅ تأكد إن الـ handler مربوط
    ensureLobbyChatUI();

    // ✅ تحديث زر اللعب (الليدر فقط)
    updatePlayButtonForLeader();

    // ✅ زرار مغادرة المجموعة
    const leaveBtn = document.getElementById('leave-party-btn');
    if (leaveBtn) {
        leaveBtn.classList.remove('hidden');
        console.log('🚪 Leave button shown');
    } else {
        console.warn('⚠️ leave-party-btn not found in DOM');
    }
}
let saveTimeout = null;

function savePlayerDataToServer() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            const unlockedIds = charactersData.filter(c => c.unlocked).map(c => c.id);
            const res = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    money: playerData.money,
                    gems: playerData.gems,
                    level: playerData.level,
                    selected_character: playerData.selectedCharacter,
                    unlocked_characters: unlockedIds
                })
            });
            if (res.ok) console.log('💾 تم حفظ البيانات على الخادم');
        } catch (err) { console.error('❌ خطأ في الحفظ:', err); }
    }, 1500);
}

function logoutPlayer() {
    if (confirm('هل تريد تسجيل الخروج؟')) { window.location.href = '/logout'; }
}

// ==========================================
// 🎨 حقن CSS
// ==========================================

(function injectStyles() {
    if (document.getElementById("game-injected-styles")) return;
    const style = document.createElement("style");
    style.id = "game-injected-styles";
    style.textContent = `
        .character-name h2 { display: none !important; }
        .character-name span { display: none !important; }

        .lobby-screen {
            position: relative !important;
            overflow: hidden !important;
            background:
                radial-gradient(ellipse at 50% 120%, rgba(255, 200, 80, 0.35) 0%, transparent 45%),
                radial-gradient(ellipse at 50% -10%, #5a2874 0%, #341a52 30%, #1e0f38 60%, #0a0510 100%) !important;
        }

        .lobby-screen::before {
            content: "";
            position: absolute;
            bottom: 0; left: 0; right: 0;
            height: 340px;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%23FFD84D' stop-opacity='0.25'/><stop offset='100%25' stop-color='%23FFD84D' stop-opacity='0.85'/></linearGradient></defs><path d='M0 100 V70 H4 V60 H7 V70 H11 V45 H15 V35 H18 V45 H22 V70 H26 V55 H30 V42 H34 V30 H37 V42 H41 V55 H46 V70 H50 V58 H54 V45 H58 V35 H62 V45 H66 V58 H70 V70 H74 V50 H78 V40 H82 V50 H86 V70 H90 V60 H94 V70 H100 V100 Z' fill='url(%23g)'/></svg>");
            background-size: 100% 100%;
            background-repeat: no-repeat;
            background-position: bottom center;
            pointer-events: none;
            z-index: 15;
            opacity: 0.9;
        }

        .lobby-screen::after {
            content: "";
            position: absolute;
            bottom: 0; left: 50%;
            transform: translateX(-50%);
            width: 120%; height: 300px;
            background: radial-gradient(ellipse at center bottom, rgba(255, 216, 77, 0.4) 0%, transparent 60%);
            pointer-events: none;
            z-index: 2;
        }

        .lobby-screen .top-bar,
        .lobby-screen .bottom-bar {
            position: relative;
            z-index: 20;
        }

        .lobby-screen .lobby-world { position: relative; z-index: 20; }
        .lobby-screen .profile {
            background: rgba(255, 216, 77, 0.1);
            border: 1px solid rgba(255, 216, 77, 0.3);
            border-radius: 30px;
            padding: 6px 16px 6px 6px;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(255, 216, 77, 0.15);
        }

        .lobby-screen .avatar {
            border-color: #FFD84D !important;
            box-shadow: 0 0 15px rgba(255, 216, 77, 0.5);
        }

        .lobby-screen .currency {
            background: rgba(255, 216, 77, 0.12) !important;
            border: 1px solid rgba(255, 216, 77, 0.3) !important;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }

        .character-platform {
            width: 400px !important;
            height: 500px !important;
            display: flex !important;
            align-items: flex-end !important;
            justify-content: center !important;
            overflow: visible !important;
            border: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
            position: relative !important;
            z-index: 6 !important;
            margin-bottom: -40px !important;
        }

        .hero-image {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: flex-end !important;
            justify-content: center !important;
            overflow: visible !important;
            border: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
            box-sizing: border-box !important;
        }

        .hero-image img {
            width: auto !important;
            height: auto !important;
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
            object-position: bottom center !important;
            display: block !important;
            pointer-events: none;
            filter:
                drop-shadow(0 8px 20px rgba(0,0,0,0.7))
                drop-shadow(0 0 40px rgba(255, 216, 77, 0.25))
                drop-shadow(0 0 60px rgba(160, 80, 220, 0.35));
        }

        .character-glow {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 500px !important;
            height: 500px !important;
            border-radius: 50% !important;
            background: radial-gradient(circle, rgba(255, 200, 80, 0.4) 0%, rgba(160, 80, 220, 0.15) 40%, transparent 70%) !important;
            filter: blur(30px) !important;
            z-index: 1 !important;
        }

        .play-btn {
            background: linear-gradient(135deg, #FFD84D 0%, #B88728 100%) !important;
            box-shadow:
                0 0 0 2px rgba(255, 216, 77, 0.4),
                0 0 30px rgba(255, 216, 77, 0.6),
                0 8px 25px rgba(0, 0, 0, 0.5) !important;
            transform: scale(1.1) !important;
            margin-top: 20px !important;
            position: relative !important;
            z-index: 10 !important;
            transition: all 0.25s ease !important;
        }

        .play-btn:hover {
            transform: scale(1.15) translateY(-3px) !important;
            box-shadow:
                0 0 0 3px rgba(255, 216, 77, 0.6),
                0 0 45px rgba(255, 216, 77, 0.9),
                0 12px 30px rgba(0, 0, 0, 0.6) !important;
        }

        .menu-item {
            background: rgba(255, 216, 77, 0.08) !important;
            border: 1px solid rgba(255, 216, 77, 0.25) !important;
            backdrop-filter: blur(8px);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }

        .menu-item:hover {
            background: rgba(255, 216, 77, 0.2) !important;
            border-color: rgba(255, 216, 77, 0.5) !important;
            box-shadow: 0 8px 25px rgba(255, 216, 77, 0.3);
        }

        .bottom-item[data-action="target"] { display: none !important; }

        .bottom-bar {
            background: rgba(0, 0, 0, 0.4) !important;
            border-top: 1px solid rgba(255, 216, 77, 0.3) !important;
            backdrop-filter: blur(12px);
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
        }

        .bottom-item {
            background: linear-gradient(145deg, rgba(255, 216, 77, 0.2), rgba(255, 216, 77, 0.06)) !important;
            border: 2px solid rgba(255, 216, 77, 0.55) !important;
            color: #ffffff !important;
            font-weight: 900 !important;
            padding: 10px 22px !important;
            border-radius: 14px !important;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9) !important;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4) !important;
            transition: all 0.25s ease !important;
            cursor: pointer !important;
        }

        .bottom-item:hover {
            background: linear-gradient(145deg, rgba(255, 216, 77, 0.45), rgba(255, 216, 77, 0.15)) !important;
            border-color: #FFD84D !important;
            transform: translateY(-3px) !important;
            box-shadow: 0 8px 22px rgba(255, 216, 77, 0.55) !important;
        }

        .bottom-item span {
            font-size: 16px !important;
            color: #FFD84D !important;
            font-weight: 900 !important;
            filter: drop-shadow(0 0 6px rgba(255, 216, 77, 0.7)) !important;
        }

        .bottom-item small {
            font-size: 11px !important;
            color: #ffffff !important;
            font-weight: 900 !important;
            letter-spacing: 0.3px !important;
            margin-top: 2px !important;
        }

        .map-tile.double-rent-selectable {
            cursor: pointer !important;
            animation: doubleRentTilePulse 1s ease-in-out infinite !important;
            z-index: 150 !important;
            box-shadow: 0 0 25px rgba(186,104,200,1), 0 0 50px rgba(225,190,231,0.7), 0 4px 8px rgba(0,0,0,.5) !important;
            border: 3px solid #E1BEE7 !important;
            pointer-events: auto !important;
        }
        @keyframes doubleRentTilePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }

        .map-tile.free-upgrade-selectable {
            cursor: pointer !important;
            animation: freeUpgradeTilePulse 1s ease-in-out infinite !important;
            z-index: 150 !important;
            box-shadow: 0 0 25px rgba(77,255,136,1), 0 0 50px rgba(77,255,136,0.7), 0 4px 8px rgba(0,0,0,.5) !important;
            border: 3px solid #4dff88 !important;
            pointer-events: auto !important;
        }
        @keyframes freeUpgradeTilePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }

        .map-tile.tile-clickable:hover {
            cursor: pointer !important;
            outline: 2px solid rgba(255, 216, 77, 0.6);
            outline-offset: -2px;
        }

        .floating-money {
            position: fixed; z-index: 9999998;
            font-family: 'Arial Black', Arial, sans-serif;
            font-weight: 900; pointer-events: none; user-select: none;
            white-space: nowrap; transform: translate(-50%, 0%);
            animation: floatingMoneyDown 1.6s cubic-bezier(0.25, 0.8, 0.4, 1) forwards;
            text-shadow: 0 0 6px currentColor, 0 0 12px currentColor, 0 1px 3px rgba(0,0,0,0.9);
        }
        .floating-money.positive { color: #4dff88; -webkit-text-stroke: 1.5px #0a4a20; }
        .floating-money.negative { color: #ff4d4d; -webkit-text-stroke: 1.5px #4a0a0a; }
        @keyframes floatingMoneyDown {
            0%   { opacity: 0; transform: translate(-50%, 0%) scale(0.3); }
            15%  { opacity: 1; transform: translate(-50%, 30%) scale(1.15); }
            30%  { transform: translate(-50%, 50%) scale(1); }
            70%  { opacity: 1; transform: translate(-50%, 130%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, 220%) scale(0.85); }
        }

        .player-corner-avatar .character-img {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            object-position: center center !important;
            pointer-events: none;
            user-select: none;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6));
            padding: 4px !important;
            box-sizing: border-box !important;
        }
        .player-token .character-img {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            object-position: bottom center !important;
            pointer-events: none;
            user-select: none;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6));
        }

        .player-token {
            width: 62px !important;
            height: 82px !important;
            left: -6px !important;
            bottom: 0 !important;
            overflow: visible !important;
            transform-origin: bottom center !important;
        }
        .player-token .character-img {
            transform: scale(0.92) !important;
            transform-origin: bottom center !important;
        }
        .player-token .temporary-character {
            transform: scale(0.55) !important;
            transform-origin: bottom center !important;
        }
        .player-token.active-turn-player {
            transform: scale(1.15) !important;
            transform-origin: bottom center !important;
        }

        .map-tile.has-player-token {
            overflow: visible !important;
            z-index: 100 !important;
        }

        .player-corner-avatar {
            cursor: pointer; transition: transform 0.2s ease;
            overflow: visible !important;
        }
        .player-corner-avatar:hover { transform: scale(1.05); }

        .passive-activation {
            position: absolute; top: 50%;
            width: 46px; height: 46px; margin-top: -23px;
            border-radius: 50%;
            background: linear-gradient(135deg, #ffd84d 0%, #ff9800 100%);
            border: 3px solid #ffffff;
            display: flex; align-items: center; justify-content: center;
            font-size: 22px;
            box-shadow: 0 0 15px rgba(255, 216, 77, 1), 0 0 30px rgba(255, 152, 0, 0.8), 0 4px 10px rgba(0, 0, 0, 0.6);
            z-index: 500; pointer-events: none;
            will-change: transform, opacity, filter;
        }
        .player-corner-1 .passive-activation,
        .player-corner-3 .passive-activation {
            left: 100%; margin-left: 6px;
            animation: passiveExitRight 2.5s cubic-bezier(.25,.8,.4,1) forwards;
        }
        .player-corner-2 .passive-activation,
        .player-corner-4 .passive-activation {
            right: 100%; margin-right: 6px;
            animation: passiveExitLeft 2.5s cubic-bezier(.25,.8,.4,1) forwards;
        }
        @keyframes passiveExitRight {
            0%   { transform: scale(0); opacity: 0; filter: brightness(1); }
            12%  { transform: scale(1.4); opacity: 1; filter: brightness(2.4); }
            22%  { transform: scale(1); opacity: 1; filter: brightness(1); }
            32%  { transform: scale(1.2); opacity: 0.55; filter: brightness(2.4); }
            42%  { transform: scale(1); opacity: 1; filter: brightness(1); }
            52%  { transform: scale(1.2); opacity: 0.55; filter: brightness(2.4); }
            62%  { transform: scale(1); opacity: 1; filter: brightness(1); }
            70%  { transform: scale(1); opacity: 1; filter: brightness(1.2); }
            85%  { transform: translate(30%, -70%) scale(1.05); opacity: 1; }
            100% { transform: translate(80%, -220%) scale(0.3); opacity: 0; }
        }
        @keyframes passiveExitLeft {
            0%   { transform: scale(0); opacity: 0; filter: brightness(1); }
            12%  { transform: scale(1.4); opacity: 1; filter: brightness(2.4); }
            22%  { transform: scale(1); opacity: 1; filter: brightness(1); }
            32%  { transform: scale(1.2); opacity: 0.55; filter: brightness(2.4); }
            42%  { transform: scale(1); opacity: 1; filter: brightness(1); }
            52%  { transform: scale(1.2); opacity: 0.55; filter: brightness(2.4); }
            62%  { transform: scale(1); opacity: 1; filter: brightness(1); }
            70%  { transform: scale(1); opacity: 1; filter: brightness(1.2); }
            85%  { transform: translate(-30%, -70%) scale(1.05); opacity: 1; }
            100% { transform: translate(-80%, -220%) scale(0.3); opacity: 0; }
        }

        .player-info-modal {
            position: fixed; inset: 0; z-index: 8000;
            display: flex; align-items: center; justify-content: center;
            padding: 20px; background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(8px); animation: fadeIn 0.25s ease;
        }
        .player-info-modal.hidden { display: none !important; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .player-info-panel {
            position: relative; width: min(420px, 100%);
            max-height: 85vh; overflow-y: auto;
            background: linear-gradient(180deg, #2a1540 0%, #150820 100%);
            border: 3px solid #E8B947; border-radius: 22px;
            padding: 24px 20px;
            box-shadow: 0 0 60px rgba(232, 185, 71, 0.4), 0 25px 70px rgba(0, 0, 0, 0.9);
            animation: slideUpModal 0.35s cubic-bezier(.25,.8,.4,1);
        }
                    @keyframes chatPopupIn {
            0%   { opacity: 0; transform: translateY(40px) scale(0.7); }
            60%  { opacity: 1; transform: translateY(-5px) scale(1.05); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideUpModal {
            from { transform: translateY(40px) scale(0.9); opacity: 0; }
            to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        .player-info-close {
            position: absolute; top: 12px; left: 12px;
            width: 34px; height: 34px; border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff; font-size: 18px;
            display: grid; place-items: center;
            cursor: pointer; z-index: 5;
        }
        .player-info-hero { text-align: center; margin-bottom: 18px; }
        .player-info-image {
            width: 160px; height: 200px;
            margin: 0 auto 12px; border-radius: 16px;
            background: radial-gradient(circle, rgba(160,80,220,0.35), transparent 70%);
            display: flex; align-items: center; justify-content: center;
        }
        .player-info-image img {
            max-width: 100%; max-height: 100%; object-fit: contain;
            filter: drop-shadow(0 8px 20px rgba(0,0,0,0.7));
        }
        .player-info-image .fallback-char { transform: scale(1.4); }
        .player-info-name {
            color: #FFD84D; font-size: 26px; font-weight: 900;
            margin-bottom: 4px;
            text-shadow: 0 0 20px rgba(255, 216, 77, 0.6);
        }
        .player-info-money {
            color: #4dff88; font-size: 16px; font-weight: 900;
            padding: 4px 14px; background: rgba(77, 255, 136, 0.12);
            border-radius: 20px; display: inline-block; margin-top: 4px;
        }
        .player-info-passives { margin-top: 16px; }
        .player-info-passives h4 {
            color: #FFD84D; font-size: 15px; font-weight: 900;
            margin-bottom: 10px; text-align: center;
        }
        .info-passive-item {
            display: flex; gap: 12px; padding: 12px;
            background: rgba(232, 185, 71, 0.08);
            border: 1px solid rgba(232, 185, 71, 0.25);
            border-radius: 12px; margin-bottom: 8px;
        }
        .info-passive-icon { font-size: 26px; flex-shrink: 0; }
        .info-passive-content { flex: 1; }
        .info-passive-name { color: #fff; font-size: 14px; font-weight: 900; margin-bottom: 3px; }
        .info-passive-desc { color: #bbb; font-size: 12px; line-height: 1.5; }

        #characters-screen {
            position: fixed; inset: 0; z-index: 500;
            background: radial-gradient(circle at 50% 30%, #2a1540 0%, #150820 60%, #0a0510 100%);
            display: flex; flex-direction: column;
            animation: slideInFromRight 0.35s cubic-bezier(.25,.8,.4,1);
        }
        @keyframes slideInFromRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0); opacity: 1; }
        }
        .chars-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 22px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid rgba(232, 185, 71, 0.2);
        }
        .chars-back-btn {
            width: 44px; height: 44px; border-radius: 50%;
            background: rgba(232, 185, 71, 0.15);
            border: 2px solid #E8B947; color: #FFD84D;
            font-size: 22px; display: grid; place-items: center;
            cursor: pointer;
        }
        .chars-title { color: #FFD84D; font-size: 26px; font-weight: 900; }
        .chars-currency { display: flex; gap: 12px; align-items: center; }
        .chars-gems {
            padding: 8px 16px;
            background: rgba(118, 169, 255, 0.15);
            border: 2px solid #76a9ff; border-radius: 20px;
            color: #fff; font-size: 15px; font-weight: 900;
        }
        .chars-grid {
            flex: 1; overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 16px; padding: 22px;
            align-content: start;
        }
        .char-card {
            position: relative;
            background: linear-gradient(180deg, rgba(60, 30, 80, 0.6) 0%, rgba(30, 15, 45, 0.9) 100%);
            border: 2px solid rgba(232, 185, 71, 0.3);
            border-radius: 16px; padding: 14px;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(.25,.8,.4,1);
        }
        .char-card:hover {
            transform: translateY(-5px);
            border-color: #E8B947;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 216, 77, 0.3);
        }
        .char-card.selected {
            border-color: #4dff88;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5), 0 0 30px rgba(77, 255, 136, 0.5);
        }
        .char-card.locked { opacity: 0.6; filter: grayscale(0.5); }
        .char-card.locked::after {
            content: "🔒"; position: absolute; top: 12px; right: 12px;
            font-size: 22px;
        }
        .char-card-image {
            width: 100%; aspect-ratio: 3 / 4;
            border-radius: 10px;
            background: linear-gradient(180deg, #2a1540, #150820);
            display: flex; align-items: flex-end; justify-content: center;
            overflow: hidden; margin-bottom: 10px;
            position: relative;
        }
        .char-card-image img {
            width: 100%; height: 100%;
            object-fit: contain; object-position: bottom center;
            transition: transform 0.3s;
        }
        .char-card:hover .char-card-image img { transform: scale(1.05) translateY(-4px); }
        .char-card-image::before {
            content: "؟"; position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-size: 60px; color: rgba(232, 185, 71, 0.3);
            font-weight: 900;
        }
        .char-card-image img[src=""] { display: none; }
        .char-card-name {
            text-align: center; color: #fff;
            font-size: 16px; font-weight: 900; margin-bottom: 4px;
        }
        .char-card-rarity { display: none !important; }
        .rarity-common, .rarity-rare, .rarity-epic, .rarity-legendary { display: none !important; }

        .character-detail {
            position: fixed; inset: 0; z-index: 600;
            display: flex; align-items: flex-end; justify-content: center;
        }
        .character-detail.hidden { display: none; }
        .detail-backdrop {
            position: absolute; inset: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(6px);
        }
        .detail-panel {
            position: relative; width: min(480px, 100%);
            max-height: 85vh;
            background: linear-gradient(180deg, #2a1540 0%, #150820 100%);
            border-top-left-radius: 28px; border-top-right-radius: 28px;
            border: 3px solid #E8B947; border-bottom: none;
            padding: 24px 22px; overflow-y: auto;
            animation: slideUpSheet 0.35s cubic-bezier(.25,.8,.4,1);
        }
        @keyframes slideUpSheet {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
        }
        .detail-close {
            position: absolute; top: 14px; left: 14px;
            width: 36px; height: 36px; border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff; font-size: 18px;
            display: grid; place-items: center; cursor: pointer;
        }
        .detail-hero { text-align: center; margin-bottom: 20px; }
        .detail-image-wrapper {
            position: relative; width: 200px; height: 240px;
            margin: 0 auto 14px; border-radius: 16px;
            background: radial-gradient(circle, rgba(160,80,220,0.3), transparent 70%);
            display: flex; align-items: center; justify-content: center;
        }
        .detail-image-wrapper img {
            max-width: 100%; max-height: 100%; object-fit: contain;
            filter: drop-shadow(0 8px 20px rgba(0,0,0,0.6));
        }
        .detail-rarity-badge { display: none !important; }
        #detail-name {
            color: #FFD84D; font-size: 28px; font-weight: 900;
            margin-bottom: 4px;
            text-shadow: 0 0 20px rgba(255, 216, 77, 0.5);
        }
        .detail-title { display: none !important; }
        .detail-passives h4 {
            color: #FFD84D; font-size: 16px; font-weight: 900;
            margin-bottom: 12px; text-align: center;
        }
        .passive-item {
            display: flex; gap: 12px; padding: 14px;
            background: rgba(232, 185, 71, 0.08);
            border: 1px solid rgba(232, 185, 71, 0.25);
            border-radius: 12px; margin-bottom: 10px;
        }
        .passive-icon { font-size: 28px; flex-shrink: 0; }
        .passive-content { flex: 1; }
        .passive-name { color: #fff; font-size: 15px; font-weight: 900; margin-bottom: 4px; }
        .passive-desc { color: #bbb; font-size: 13px; line-height: 1.6; }
        .detail-actions {
            display: flex; gap: 12px; padding-top: 16px;
            border-top: 1px solid rgba(232, 185, 71, 0.2);
        }
        .detail-btn-primary, .detail-btn-gold {
            flex: 1; padding: 16px 20px; border-radius: 14px;
            font-size: 16px; font-weight: 900; cursor: pointer;
            font-family: inherit;
        }
        .detail-btn-primary {
            background: linear-gradient(135deg, #4dff88, #1eaa55);
            color: #0d0919; box-shadow: 0 4px 0 #0a5a28;
        }
        .detail-btn-gold {
            background: linear-gradient(135deg, #ffd84d, #b88728);
            color: #1a0b2e; box-shadow: 0 4px 0 #6a4a10;
        }
        .hidden { display: none !important; }

        .lobby-screen .top-bar,
        .lobby-screen .bottom-bar { z-index: 20 !important; }
        .play-btn { z-index: 25 !important; }
        .side-menu { z-index: 20 !important; position: relative !important; }
            
        .chance-card-modal {
            position: fixed; inset: 0; z-index: 9999998;
            background: rgba(0,0,0,0.92);
            display: flex; align-items: center; justify-content: center;
            padding: 20px; direction: rtl;
            font-family: Arial, sans-serif;
            backdrop-filter: blur(8px);
            animation: chanceCardFadeIn 0.3s ease;
            overflow-y: auto;
        }
        @keyframes chanceCardFadeIn { from { opacity: 0; } to { opacity: 1; } }

        .chance-card {
            width: min(420px, 92vw);
            max-height: 88vh;
            background: linear-gradient(180deg, #2a1540 0%, #150820 100%);
            border: 4px solid var(--card-color, #E8B947);
            border-radius: 24px;
            padding: 24px 22px 20px;
            box-shadow:
                0 0 60px var(--card-glow, rgba(232, 185, 71, 0.6)),
                0 25px 80px rgba(0, 0, 0, 0.9);
            position: relative;
            overflow: hidden;
            animation: chanceCardPop 0.55s cubic-bezier(.34,1.56,.64,1);
            transform-origin: center;
        }
        @keyframes chanceCardPop {
            0%   { transform: rotateY(90deg) scale(0.3); opacity: 0; }
            60%  { transform: rotateY(0deg) scale(1.05); opacity: 1; }
            100% { transform: rotateY(0deg) scale(1); opacity: 1; }
        }

        .chance-card::before {
            content: "";
            position: absolute; inset: 0;
            background:
                radial-gradient(circle at 50% 0%, var(--card-glow, rgba(232,185,71,0.35)) 0%, transparent 50%),
                radial-gradient(circle at 50% 100%, var(--card-glow, rgba(232,185,71,0.2)) 0%, transparent 50%);
            pointer-events: none;
        }

        .chance-card-badge {
            position: absolute;
            top: 14px; left: 14px;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 1px;
            background: var(--card-color, #E8B947);
            color: #1a0b2e;
            box-shadow: 0 0 15px var(--card-glow, rgba(232,185,71,0.8));
            z-index: 5;
        }

        .chance-card-type-icon {
            position: absolute;
            top: 14px; right: 14px;
            width: 38px; height: 38px;
            border-radius: 50%;
            background: rgba(0,0,0,0.5);
            border: 2px solid var(--card-color, #E8B947);
            display: flex; align-items: center; justify-content: center;
            font-size: 20px;
            box-shadow: 0 0 15px var(--card-glow, rgba(232,185,71,0.8));
            z-index: 5;
        }

        .chance-card-image-area {
            width: 100%;
            height: 170px;
            margin: 30px 0 18px;
            display: flex; align-items: center; justify-content: center;
            position: relative;
            z-index: 3;
        }

        .chance-card-image-area .card-emoji {
            font-size: 100px;
            line-height: 1;
            filter: drop-shadow(0 8px 20px rgba(0,0,0,0.6))
                    drop-shadow(0 0 30px var(--card-glow, rgba(232,185,71,0.7)));
            animation: emojiFloat 3s ease-in-out infinite;
        }
        @keyframes emojiFloat {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-10px); }
        }

        .chance-card-image-area .card-img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 8px 20px rgba(0,0,0,0.6))
                    drop-shadow(0 0 30px var(--card-glow, rgba(232,185,71,0.7)));
        }

        .chance-card-name {
            text-align: center;
            color: var(--card-color, #FFD84D);
            font-size: 26px;
            font-weight: 900;
            margin-bottom: 12px;
            text-shadow: 0 0 20px var(--card-glow, rgba(255,216,77,0.6));
            position: relative;
            z-index: 3;
        }

        .chance-card-divider {
            width: 60%;
            height: 2px;
            margin: 0 auto 16px;
            background: linear-gradient(90deg, transparent 0%, var(--card-color, #FFD84D) 50%, transparent 100%);
            position: relative;
            z-index: 3;
        }

        .chance-card-text {
            text-align: center;
            color: #ddd;
            font-size: 16px;
            line-height: 1.7;
            font-weight: 700;
            margin-bottom: 20px;
            padding: 0 8px;
            position: relative;
            z-index: 3;
            white-space: pre-line;
        }

        .chance-card-btn {
            width: 100%;
            padding: 15px 20px;
            border: none;
            border-radius: 14px;
            font-size: 17px;
            font-weight: 900;
            cursor: pointer;
            font-family: inherit;
            background: linear-gradient(135deg, var(--card-color, #ffd84d), #888);
            color: #0d0919;
            box-shadow: 0 4px 0 rgba(0,0,0,0.4), 0 6px 15px rgba(0,0,0,0.4);
            transition: all 0.2s ease;
            position: relative;
            z-index: 3;
        }
        .chance-card-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 0 rgba(0,0,0,0.4), 0 10px 25px var(--card-glow, rgba(255,216,77,0.6));
        }
        .chance-card-btn:active {
            transform: translateY(2px);
            box-shadow: 0 2px 0 rgba(0,0,0,0.4);
        }

        .chance-card-timer {
            text-align: center;
            color: #888;
            font-size: 13px;
            font-weight: 700;
            margin-top: 12px;
            position: relative;
            z-index: 3;
        }

        .chance-card.type-reward      { --card-color: #4dff88; --card-glow: rgba(77, 255, 136, 0.6); }
        .chance-card.type-loss        { --card-color: #ff4d4d; --card-glow: rgba(255, 77, 77, 0.6); }
        .chance-card.type-move        { --card-color: #ffd84d; --card-glow: rgba(255, 216, 77, 0.6); }
        .chance-card.type-strategic   { --card-color: #BA68C8; --card-glow: rgba(186, 104, 200, 0.6); }
        .chance-card.type-interactive { --card-color: #4a9fe8; --card-glow: rgba(74, 159, 232, 0.6); }
        .chance-card.type-info        { --card-color: #888;    --card-glow: rgba(136, 136, 136, 0.5); }

        .chance-card-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            max-width: 92vw;
        }

        .chance-card-player-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 26px;
            border-radius: 18px;
            background: linear-gradient(135deg, #2a1540, #150820);
            border: 3px solid #FFD84D;
            box-shadow: 0 0 30px rgba(255,216,77,0.7), 0 8px 20px rgba(0,0,0,0.6);
            font-family: Arial, sans-serif;
            direction: rtl;
            animation: chanceHeaderDrop 0.6s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes chanceHeaderDrop {
            0%   { opacity: 0; transform: translateY(-30px) scale(0.7); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .hdr-icon { font-size: 26px; filter: drop-shadow(0 0 8px #FFD84D); }
        .hdr-text {
            color: #FFD84D;
            font-size: 22px;
            font-weight: 900;
            letter-spacing: 2px;
            text-shadow: 0 0 15px rgba(255,216,77,0.8);
        }
        .hdr-sep {
            width: 2px;
            height: 28px;
            background: linear-gradient(180deg, transparent, #FFD84D, transparent);
        }
        .hdr-name {
            color: #fff;
            font-size: 20px;
            font-weight: 900;
            text-shadow: 0 0 10px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.9);
        }

        .double-card-badge {
            position: absolute !important;
            top: -12px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            padding: 6px 18px !important;
            border-radius: 16px !important;
            background: linear-gradient(135deg, #ffd84d, #b88728) !important;
            color: #1a0b2e !important;
            font-size: 13px !important;
            font-weight: 900 !important;
            letter-spacing: 1px !important;
            z-index: 100 !important;
            box-shadow:
                0 0 20px rgba(255, 216, 77, 0.9),
                0 0 40px rgba(255, 152, 0, 0.6) !important;
            animation: doubleBadgePulse 1.5s ease-in-out infinite !important;
            pointer-events: none !important;
            white-space: nowrap;
        }
        @keyframes doubleBadgePulse {
            0%, 100% { transform: translateX(-50%) scale(1); }
            50%      { transform: translateX(-50%) scale(1.1); }
        }

        .lifesaver-btn {
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            padding: 14px 28px;
            border: none;
            border-radius: 16px;
            background: linear-gradient(135deg, #4dff88, #1eaa55);
            color: #0d0919;
            font-size: 16px;
            font-weight: 900;
            cursor: pointer;
            font-family: inherit;
            z-index: 9999997;
            box-shadow:
                0 0 25px rgba(77, 255, 136, 0.9),
                0 0 50px rgba(77, 255, 136, 0.5);
            animation: lifesaverPulse 1.5s ease-in-out infinite;
        }
        @keyframes lifesaverPulse {
            0%, 100% { transform: translateX(-50%) scale(1); }
            50%      { transform: translateX(-50%) scale(1.06); }
        }

        .player-token.swap-effect {
            animation: swapFlash 0.9s ease-in-out 2;
            z-index: 500 !important;
        }
        @keyframes swapFlash {
            0% { filter: drop-shadow(0 0 0 transparent) brightness(1); transform: scale(1); }
            30% { filter: drop-shadow(0 0 20px #BA68C8) drop-shadow(0 0 35px #fff) brightness(2.5); transform: scale(1.5); }
            60% { filter: drop-shadow(0 0 25px #fff) drop-shadow(0 0 40px #BA68C8) brightness(3); transform: scale(1.6) rotate(10deg); }
            100% { filter: drop-shadow(0 0 0 transparent) brightness(1); transform: scale(1); }
        }
        .swap-flash-line {
            position: fixed;
            height: 4px;
            background: linear-gradient(90deg, transparent 0%, #BA68C8 20%, #fff 50%, #BA68C8 80%, transparent 100%);
            box-shadow: 0 0 20px #BA68C8, 0 0 40px #fff;
            z-index: 9999997;
            pointer-events: none;
            border-radius: 999px;
            transform-origin: center;
            animation: swapLineFade 1s ease-out forwards;
        }
        @keyframes swapLineFade {
            0% { opacity: 0; transform: scaleX(0); }
            20% { opacity: 1; transform: scaleX(1); }
            80% { opacity: 1; }
            100% { opacity: 0; transform: scaleX(1.1); }
        }

        .play-type-screen {
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: radial-gradient(circle at center, #39214d 0%, #170d23 45%, #0a0612 100%);
            padding: 20px; gap: 30px;
        }
        .play-type-title {
            color: #FFD84D; font-size: 36px; font-weight: 900;
            text-shadow: 0 0 25px rgba(244,210,122,.6);
        }
        .play-type-grid {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 18px; max-width: 750px; width: 100%;
        }
        .play-type-card {
            padding: 30px 20px; border-radius: 22px;
            background: linear-gradient(145deg, #2c1d3c, #170d23);
            border: 2px solid rgba(244,210,122,.3);
            display: flex; flex-direction: column; align-items: center; gap: 10px;
            cursor: pointer; transition: all 0.25s ease;
        }
        .play-type-card:hover {
            transform: translateY(-6px) scale(1.04);
            border-color: #E8B947;
            box-shadow: 0 18px 45px rgba(217,173,69,.35);
        }
        .play-type-icon { font-size: 52px; }
        .play-type-name { font-size: 20px; font-weight: 900; color: #FFD84D; }
        .play-type-desc { font-size: 12px; color: #b9adca; text-align: center; }

        .player-strategic-cards {
            position: absolute;
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            z-index: 205;
            pointer-events: auto;
            padding: 4px;
        }
        .player-corner-1 .player-strategic-cards {
            left: calc(100% + 8px);
            top: 20px;
            flex-direction: row;
            max-width: 100px;
            justify-content: flex-start;
        }
        .player-corner-2 .player-strategic-cards {
            right: calc(100% + 8px);
            top: 20px;
            flex-direction: row-reverse;
            max-width: 100px;
            justify-content: flex-start;
        }
        .player-corner-3 .player-strategic-cards {
            left: calc(100% + 8px);
            bottom: 20px;
            flex-direction: row;
            max-width: 100px;
            justify-content: flex-start;
        }
        .player-corner-4 .player-strategic-cards {
            right: calc(100% + 8px);
            bottom: 20px;
            flex-direction: row-reverse;
            max-width: 100px;
            justify-content: flex-start;
        }

        .strategic-card-badge {
            width: 34px;
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(180deg, #2a1540 0%, #150820 100%);
            border: 2px solid #FFD84D;
            border-radius: 8px;
            font-size: 20px;
            line-height: 1;
            position: relative;
            cursor: help;
            transition: transform 0.15s ease;
            animation: strategicCardPop 0.4s cubic-bezier(.34,1.56,.64,1);
            box-shadow: 0 0 8px rgba(255,216,77,0.7), 0 3px 6px rgba(0,0,0,0.6);
        }
        .strategic-card-badge:hover { transform: scale(1.2); z-index: 999; }
        .strategic-card-badge .card-counter {
            position: absolute;
            bottom: -5px;
            right: -5px;
            min-width: 17px;
            height: 17px;
            padding: 0 3px;
            background: #ff4d4d;
            border: 2px solid #fff;
            border-radius: 10px;
            color: #fff;
            font-size: 10px;
            font-weight: 900;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 6px rgba(255,77,77,0.9);
            line-height: 1;
        }
        .strategic-card-badge.type-buff {
            border-color: #4dff88;
            box-shadow: 0 0 10px rgba(77,255,136,0.85), 0 3px 6px rgba(0,0,0,0.6);
        }
        .strategic-card-badge.type-debuff {
            border-color: #ff4d4d;
            box-shadow: 0 0 10px rgba(255,77,77,0.85), 0 3px 6px rgba(0,0,0,0.6);
        }
        .strategic-card-badge.type-strategic {
            border-color: #BA68C8;
            box-shadow: 0 0 10px rgba(186,104,200,0.85), 0 3px 6px rgba(0,0,0,0.6);
        }
        @keyframes strategicCardPop {
            0%   { transform: scale(0.2) rotate(-20deg); opacity: 0; }
            70%  { transform: scale(1.15) rotate(5deg); }
            100% { transform: scale(1) rotate(0); opacity: 1; }
        }

        @media (max-width: 700px) {
            .chars-grid { grid-template-columns: repeat(2, 1fr); padding: 14px; gap: 10px; }
            .chars-title { font-size: 20px; }
            .char-card { padding: 10px; }
            .char-card-name { font-size: 14px; }
            .detail-panel { padding: 20px 16px; }
            #detail-name { font-size: 22px; }
            .passive-activation {
                width: 36px !important;
                height: 36px !important;
                margin-top: -18px !important;
                font-size: 18px !important;
            }
            .player-token { width: 44px !important; height: 58px !important; left: -4px !important; }
            .player-token .character-img { transform: scale(0.9) !important; }
            .player-token.active-turn-player {
                transform: scale(1.1) !important;
                transform-origin: bottom center !important;
            }
            .character-platform {
                width: 240px !important;
                height: 320px !important;
                margin-bottom: -20px !important;
            }
            .character-platform::after {
                height: 120px;
                width: 150%;
            }
            .lobby-screen::before { height: 120px; }
            .character-glow { width: 300px !important; height: 300px !important; }
            .play-btn { transform: scale(1) !important; }
            .play-btn:hover { transform: scale(1.05) translateY(-3px) !important; }
            .play-type-grid { grid-template-columns: 1fr; }
            .play-type-title { font-size: 26px; }
            .double-card-badge {
                font-size: 10px !important;
                padding: 4px 12px !important;
                top: -8px !important;
            }
            .hdr-text { font-size: 16px; letter-spacing: 1px; }
            .hdr-name { font-size: 15px; }
            .chance-card-player-header { padding: 8px 18px; gap: 8px; }
            .strategic-card-badge {
                width: 26px; height: 32px; font-size: 15px; border-radius: 6px;
            }
            .strategic-card-badge .card-counter {
                min-width: 13px; height: 13px; font-size: 8px;
            }
            .player-corner-1 .player-strategic-cards,
            .player-corner-3 .player-strategic-cards {
                left: calc(100% + 4px);
                max-width: 60px;
                gap: 3px;
            }
            .player-corner-2 .player-strategic-cards,
            .player-corner-4 .player-strategic-cards {
                right: calc(100% + 4px);
                max-width: 60px;
                gap: 3px;
            }
        }
    `;
    document.head.appendChild(style);
})();

// ==========================================
// 🎭 نظام الشخصيات
// ==========================================

const charactersData = [
    {
        id: "sama",
        name: "سما",
        image:     "/static/images/characters/character-sama.png",
        cardImage: "/static/images/characters/character-sama-id.png",
        unlocked: true,
        passives: [
            { icon: "🪽", name: "أجنحة الحرية", desc: "عند الحصول على ثلاثة أزواج متتالية من النرد، ينتقل اللاعب إلى بوابة العالم بنسبة 75% بدلاً من دخول المحطة السوداء" },
            { icon: "💼", name: "خدمة الضيوف", desc: "عند الوقوف على بوابة العالم، يحصل اللاعب على 100$ مضروبة في عدد الزيارات" }
        ]
    },
    {
        id: "kiro",
        name: "كيرو",
        image:     "/static/images/characters/character-kiro.png",
        cardImage: "/static/images/characters/character-kiro-id.png",
        unlocked: true,
        passives: [
            { icon: "🔄", name: "الارتداد", desc: "عند خسارة أي مبلغ، توجد فرصة 70% لاسترداد 70% من المبلغ من خزينة اللعبة" },
            { icon: "📋", name: "لدي خطة", desc: "عند سحب بطاقة حظ، توجد فرصة 35% لإظهار خيار تجاهل البطاقة وسحب أخرى" }
        ]
    }
];

function openCharactersScreen() {
    const screen = document.getElementById("characters-screen");
    if (!screen) return;
    screen.classList.remove("hidden");
    renderCharactersGrid();
    const gemsEl = document.getElementById("chars-gems-count");
    if (gemsEl) gemsEl.textContent = playerData.gems || 0;
}

function closeCharactersScreen() {
    const screen = document.getElementById("characters-screen");
    if (screen) screen.classList.add("hidden");
    closeCharacterDetail();
}

function renderCharactersGrid() {
    const grid = document.getElementById("chars-grid");
    if (!grid) return;
    grid.innerHTML = "";

    charactersData.forEach(char => {
        const card = document.createElement("div");
        card.className = "char-card";
        if (!char.unlocked) card.classList.add("locked");
        if (playerData.selectedCharacter === char.id) card.classList.add("selected");

        const imgSrc = char.cardImage || char.image || "";

        card.innerHTML = `
            <div class="char-card-image">
                ${imgSrc ? `<img src="${imgSrc}" alt="${char.name}" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="char-card-name">${char.name}</div>
        `;
        card.onclick = () => openCharacterDetail(char.id);
        grid.appendChild(card);
    });
}
function openCharacterDetail(charId) {
    const char = charactersData.find(c => c.id === charId);
    if (!char) return;

    const panel = document.getElementById("character-detail");
    if (!panel) return;

    const imgSrc = char.image || char.cardImage || "";

    const img = document.getElementById("detail-image");
    if (img) {
        if (imgSrc) { img.src = imgSrc; img.style.display = "block"; }
        else { img.src = ""; img.style.display = "none"; }
    }

    document.getElementById("detail-name").textContent = char.name;

    const titleEl = document.getElementById("detail-title");
    if (titleEl) titleEl.style.display = "none";

    const rarityBadge = document.getElementById("detail-rarity");
    if (rarityBadge) rarityBadge.style.display = "none";

    const passivesList = document.getElementById("detail-passives-list");
    if (passivesList) {
        passivesList.innerHTML = "";
        if (char.passives.length === 0) {
            passivesList.innerHTML = `<p style="text-align:center;color:#888;">لا توجد مهارات</p>`;
        } else {
            char.passives.forEach(p => {
                const item = document.createElement("div");
                item.className = "passive-item";
                item.innerHTML = `
                    <div class="passive-icon">${p.icon}</div>
                    <div class="passive-content">
                        <div class="passive-name">${p.name}</div>
                        <div class="passive-desc">${p.desc}</div>
                    </div>
                `;
                passivesList.appendChild(item);
            });
        }
    }

    const selectBtn = document.getElementById("detail-select-btn");
    const unlockBtn = document.getElementById("detail-unlock-btn");

    if (char.unlocked) {
        unlockBtn.classList.add("hidden");
        selectBtn.classList.remove("hidden");
        if (playerData.selectedCharacter === char.id) {
            selectBtn.textContent = "✅ مختارة حالياً";
            selectBtn.disabled = true;
        } else {
            selectBtn.textContent = "🎯 اختيار الشخصية";
            selectBtn.disabled = false;
            selectBtn.onclick = () => selectCharacter(char.id);
        }
    } else {
        selectBtn.classList.add("hidden");
        unlockBtn.classList.remove("hidden");
        unlockBtn.onclick = () => tryUnlockCharacter(char.id);
    }

    panel.classList.remove("hidden");
}

function closeCharacterDetail() {
    const panel = document.getElementById("character-detail");
    if (panel) panel.classList.add("hidden");
}

function selectCharacter(charId) {
    const char = charactersData.find(c => c.id === charId);
    if (!char) return;

    playerData.selectedCharacter = char.id;
    playerData.characterName   = char.name;
    playerData.characterImage  = char.image || null;
    playerData.characterAvatar = char.cardImage || char.image || null;
    playerData.characterPassives = char.passives || [];

    const heroImageEl = document.getElementById("hero-image");
    if (heroImageEl) {
        if (playerData.characterAvatar) {
            heroImageEl.innerHTML = `<img src="${playerData.characterAvatar}" alt="${char.name}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
        } else {
            heroImageEl.innerHTML = `<div class="temporary-character">
                <div class="character-head"></div>
                <div class="character-body">
                    <div class="character-scarf"></div>
                    <div class="character-bag"></div>
                </div>
            </div>`;
        }
    }

    closeCharacterDetail();
    renderCharactersGrid();
    savePlayerDataToServer();
        // ✅ بلّغ السيرفر بتغيير الشخصية
    if (socket && socket.connected) {
        socket.emit('lobby:character_changed', {});
    }
}

function tryUnlockCharacter(charId) {
    const cost = 500;
    if ((playerData.gems || 0) < cost) {
        alert(`تحتاج ${cost} جوهرة لفتح هذه الشخصية!`);
        return;
    }
    playerData.gems -= cost;
    const char = charactersData.find(c => c.id === charId);
    if (char) char.unlocked = true;

    const gemsEl = document.getElementById("chars-gems-count");
    if (gemsEl) gemsEl.textContent = playerData.gems;

    closeCharacterDetail();
    renderCharactersGrid();
    savePlayerDataToServer();
}

// ==========================================
// 💰 الأرقام الطائرة
// ==========================================

function showFloatingMoney(playerId, amount) {
    if (!amount || amount === 0) return;
    let el = document.querySelector(`.player-corner[data-player-id="${playerId}"] .player-corner-avatar`);
    if (!el) el = document.querySelector(`.player-corner[data-player-id="${playerId}"]`);
    if (!el) {
        const activePlayers = getActivePlayers();
        const idx = activePlayers.findIndex(p => p.id === playerId);
        if (idx === -1) return;
        el = document.querySelector('.player-corner-' + (idx + 1) + ' .player-corner-avatar')
          || document.querySelector('.player-corner-' + (idx + 1));
    }
    if (!el) return;

    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.bottom + 4;

    const floating = document.createElement("div");
    floating.className = "floating-money " + (amount > 0 ? "positive" : "negative");
    floating.textContent = (amount > 0 ? "+" : "") + amount;

    const absAmount = Math.abs(amount);
    let fontSize = 16;
    if (absAmount >= 500)      fontSize = 22;
    else if (absAmount >= 200) fontSize = 20;
    else if (absAmount >= 100) fontSize = 18;
    else if (absAmount >= 50)  fontSize = 17;

    floating.style.fontSize = fontSize + "px";
    floating.style.left = x + "px";
    floating.style.top = y + "px";
    document.body.appendChild(floating);
    setTimeout(() => { if (floating.parentNode) floating.remove(); }, 1700);
}

// ==========================================
// 💫 تفعيل الباسيف
// ==========================================

function showPassiveActivation(playerId, passiveIcon, passiveName) {
    const avatarEl = document.querySelector(
        `.player-corner[data-player-id="${playerId}"] .player-corner-avatar`
    );
    if (!avatarEl) return;
    const old = avatarEl.querySelector(".passive-activation");
    if (old) old.remove();

    const badge = document.createElement("div");
    badge.className = "passive-activation";
    badge.textContent = passiveIcon;
    badge.title = passiveName;
    avatarEl.appendChild(badge);
    setTimeout(() => { if (badge.parentNode) badge.remove(); }, 2700);
    setMessage(`✨ تفعيل المهارة: ${passiveName}`);
}

// ==========================================
// 📋 نافذة معلومات اللاعب
// ==========================================

function openPlayerInfo(playerId) {
    const player = players[playerId];
    if (!player) return;
    const old = document.getElementById("player-info-modal");
    if (old) old.remove();

    const charId = player.character || "sama";
    const charInfo = charactersData.find(c => c.id === charId);
    const charName = charInfo ? charInfo.name : (player.characterName || player.name);
    const charImage = charInfo ? (charInfo.cardImage || charInfo.image) : (player.characterAvatar || player.characterImage);
    const passives = charInfo ? (charInfo.passives || []) : [];

    let imageHTML;
    if (charImage) {
        imageHTML = `<img src="${charImage}" alt="${charName}" onerror="this.style.display='none'">`;
    } else {
        imageHTML = `<div class="temporary-character fallback-char">
            <div class="character-head"></div>
            <div class="character-body">
                <div class="character-scarf"></div>
                <div class="character-bag"></div>
            </div>
        </div>`;
    }

    let passivesHTML = "";
    if (passives.length === 0) {
        passivesHTML = '<p style="text-align:center;color:#888;">لا توجد مهارات</p>';
    } else {
        passives.forEach(p => {
            passivesHTML += `
                <div class="info-passive-item">
                    <div class="info-passive-icon">${p.icon}</div>
                    <div class="info-passive-content">
                        <div class="info-passive-name">${p.name}</div>
                        <div class="info-passive-desc">${p.desc}</div>
                    </div>
                </div>
            `;
        });
    }

    const modal = document.createElement("div");
    modal.id = "player-info-modal";
    modal.className = "player-info-modal";
    modal.innerHTML = `
        <div class="player-info-panel">
            <button class="player-info-close" type="button">✕</button>
            <div class="player-info-hero">
                <div class="player-info-image">${imageHTML}</div>
                <div class="player-info-name">${charName}</div>
                <div class="player-info-money">${player.money} $</div>
            </div>
            <div class="player-info-passives">
                <h4>⚡ المهارات الخاصة</h4>
                ${passivesHTML}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector(".player-info-close").onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// ==========================================
// 💵 أنيميشن نقل الأموال
// ==========================================

function getPlayerCornerCenter(playerId) {
    let el = document.querySelector(`.player-corner[data-player-id="${playerId}"] .player-corner-avatar`);
    if (!el) el = document.querySelector(`.player-corner[data-player-id="${playerId}"]`);
    if (!el) {
        const activePlayers = getActivePlayers();
        const idx = activePlayers.findIndex(p => p.id === playerId);
        if (idx === -1) return null;
        el = document.querySelector('.player-corner-' + (idx + 1) + ' .player-corner-avatar')
          || document.querySelector('.player-corner-' + (idx + 1));
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function getMapCenterPos() {
    const el = document.querySelector('.map-center');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function animateMoneyTransfer(fromPlayerId, toPlayerId, amount, onComplete) {
    try {
        const COIN_SRC = '/static/images/mony/mony11.png';
        const center = getMapCenterPos();
        if (!center) { if (onComplete) onComplete(); return; }

        const isFromBank = (fromPlayerId === null || fromPlayerId === "bank" || fromPlayerId === undefined);
        const isToBank   = (toPlayerId   === null || toPlayerId   === "bank" || toPlayerId   === undefined);
        if (isFromBank && isToBank) { if (onComplete) onComplete(); return; }

        const sourcePos = isFromBank ? center : (getPlayerCornerCenter(fromPlayerId) || center);
        const targetPos = isToBank   ? center : (getPlayerCornerCenter(toPlayerId)   || center);
        if (!sourcePos || !targetPos) { if (onComplete) onComplete(); return; }

        const absAmount = Math.abs(amount);
        let coinCount;
        if (absAmount < 50)        coinCount = 2;
        else if (absAmount < 150)  coinCount = 4;
        else if (absAmount < 300)  coinCount = 6;
        else if (absAmount < 500)  coinCount = 9;
        else if (absAmount < 1000) coinCount = 12;
        else                       coinCount = 18;

        const STAGGER = 80, FLY_TIME = 450, HOLD_TIME = 800, FLY_TIME_2 = 450, FLY_OUT_STAGGER = 30;
        const SIZE_START = 55;
        const allCoins = [];
        const startX = sourcePos.x - SIZE_START / 2;
        const startY = sourcePos.y - SIZE_START / 2;
        const dx1 = center.x - sourcePos.x;
        const dy1 = center.y - sourcePos.y;

        for (let i = 0; i < coinCount; i++) setTimeout(() => spawnCoin(i), i * STAGGER);

        function spawnCoin(index) {
            const coin = document.createElement('img');
            coin.src = COIN_SRC; coin.alt = ''; coin.draggable = false;
            coin.style.cssText = `
                position: fixed; left: ${startX}px; top: ${startY}px;
                width: ${SIZE_START}px; height: ${SIZE_START}px;
                pointer-events: none; z-index: 9999999;
                user-select: none; will-change: transform, opacity;
                filter: drop-shadow(0 0 10px rgba(255,215,0,0.95))
                        drop-shadow(0 0 20px rgba(255,165,0,0.7))
                        drop-shadow(0 4px 8px rgba(0,0,0,0.8));
            `;
            coin.onerror = () => {
                coin.remove();
                const emoji = document.createElement('div');
                emoji.textContent = '🪙';
                emoji.style.cssText = `
                    position: fixed; left: ${startX}px; top: ${startY}px;
                    font-size: ${SIZE_START}px; line-height: 1;
                    pointer-events: none; z-index: 9999999;
                    filter: drop-shadow(0 0 10px rgba(255,215,0,0.95));
                `;
                document.body.appendChild(emoji);
                setupCoin(emoji);
            };
            document.body.appendChild(coin);
            setupCoin(coin);
        }

        function setupCoin(coin) {
            const offX = (Math.random() - 0.5) * 60;
            const offY = (Math.random() - 0.5) * 60;
            const arc1 = -50 - Math.random() * 40;
            const rot1 = (Math.random() - 0.5) * 50;
            const rot2 = (Math.random() - 0.5) * 30;

            coin.animate([
                { transform: `translate(0px, 0px) scale(0.3) rotate(0deg)`, opacity: 0 },
                { transform: `translate(${dx1 * 0.5 + offX * 0.6}px, ${dy1 * 0.5 + arc1 + offY * 0.6}px) scale(1.15) rotate(${rot1}deg)`, opacity: 1, offset: 0.65 },
                { transform: `translate(${dx1 + offX}px, ${dy1 + offY}px) scale(1) rotate(${rot2}deg)`, opacity: 1 }
            ], { duration: FLY_TIME, easing: 'cubic-bezier(0.34, 0.8, 0.65, 1)', fill: 'forwards' });

            coin._offX = offX; coin._offY = offY;
            coin._midX = dx1 + offX; coin._midY = dy1 + offY;
            allCoins.push(coin);
        }

        const allArrivedTime = (coinCount - 1) * STAGGER + FLY_TIME;
        const launchTime = allArrivedTime + HOLD_TIME;

        setTimeout(() => {
            allCoins.forEach((coin, i) => setTimeout(() => flyToTarget(coin), i * FLY_OUT_STAGGER));
        }, launchTime);

        function flyToTarget(coin) {
            const dx2 = targetPos.x - center.x;
            const dy2 = targetPos.y - center.y;
            const offX = coin._offX, offY = coin._offY;
            const midX = coin._midX, midY = coin._midY;
            const arc2 = -50 - Math.random() * 40;
            const rot3 = (Math.random() - 0.5) * 40;

            const anim2 = coin.animate([
                { transform: `translate(${midX}px, ${midY}px) scale(1) rotate(0deg)`, opacity: 1 },
                { transform: `translate(${midX + dx2 * 0.5 + offX * 0.3}px, ${midY + dy2 * 0.5 + arc2 + offY * 0.3}px) scale(0.95) rotate(${rot3}deg)`, opacity: 1, offset: 0.6 },
                { transform: `translate(${midX + dx2}px, ${midY + dy2}px) scale(0.6) rotate(0deg)`, opacity: 0 }
            ], { duration: FLY_TIME_2, easing: 'cubic-bezier(0.34, 0.8, 0.65, 1)', fill: 'forwards' });
            anim2.onfinish = () => coin.remove();
        }

        const totalDuration = allArrivedTime + HOLD_TIME + (coinCount - 1) * FLY_OUT_STAGGER + FLY_TIME_2 + 100;
        if (onComplete) setTimeout(onComplete, totalDuration);
    } catch (e) {
        console.error("[money] animation error:", e);
        if (onComplete) onComplete();
    }
}

function animateMoneyTransferDirect(fromId, toId, amount, onComplete) {
    try {
        const COIN_SRC = '/static/images/mony/mony11.png';
        const sourcePos = getPlayerCornerCenter(fromId);
        const targetPos = getPlayerCornerCenter(toId);
        if (!sourcePos || !targetPos) { if (onComplete) onComplete(); return; }

        const absAmount = Math.abs(amount);
        let coinCount = absAmount < 100 ? 4 : (absAmount < 300 ? 7 : (absAmount < 600 ? 10 : 14));

        const STAGGER = 55, FLY_TIME = 620;
        const SIZE = 52;

        for (let i = 0; i < coinCount; i++) {
            setTimeout(() => {
                const coin = document.createElement('img');
                coin.src = COIN_SRC;
                coin.draggable = false;
                coin.style.cssText = `
                    position: fixed;
                    left: ${sourcePos.x - SIZE/2}px;
                    top: ${sourcePos.y - SIZE/2}px;
                    width: ${SIZE}px; height: ${SIZE}px;
                    pointer-events: none; z-index: 9999999;
                    filter: drop-shadow(0 0 12px gold) drop-shadow(0 0 20px orange);
                `;
                coin.onerror = () => coin.remove();
                document.body.appendChild(coin);

                const dx = targetPos.x - sourcePos.x;
                const dy = targetPos.y - sourcePos.y;
                const arc = -70 - Math.random() * 50;

                const anim = coin.animate([
                    { transform: 'translate(0,0) scale(0.3)', opacity: 0 },
                    { transform: `translate(${dx*0.5}px, ${dy*0.5 + arc}px) scale(1.15)`, opacity: 1, offset: 0.55 },
                    { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0 }
                ], { duration: FLY_TIME, easing: 'cubic-bezier(0.34, 0.8, 0.65, 1)', fill: 'forwards' });

                anim.onfinish = () => coin.remove();
            }, i * STAGGER);
        }

        const total = (coinCount - 1) * STAGGER + FLY_TIME + 100;
        setTimeout(() => { if (onComplete) onComplete(); }, total);
    } catch(e) {
        console.error(e);
        if (onComplete) onComplete();
    }
}
function transferMoney(fromId, toId, amount, callback) {
    if (amount <= 0) { if (callback) callback(); return; }
    animateMoneyTransfer(fromId, toId, amount, () => {
        if (fromId !== null && fromId !== "bank" && players[fromId]) {
            players[fromId].money -= amount;
            showFloatingMoney(fromId, -amount);

            const fromPlayer = players[fromId];
            if (fromPlayer && fromPlayer.human && playerData.selectedCharacter === "kiro" && !fromPlayer._reboundInProgress) {
                const roll = Math.floor(Math.random() * 100) + 1;
                if (roll <= 70) {
                    const refund = Math.floor(amount * 0.7);
                    fromPlayer._reboundInProgress = true;
                    setTimeout(() => {
                        showPassiveActivation(fromPlayer.id, "🔄", "الارتداد");
                        setTimeout(() => {
                            transferMoney(null, fromPlayer.id, refund, () => {
                                setMessage(`🔄 الارتداد: استرد كيرو ${refund}$ من خزينة اللعبة`);
                                fromPlayer._reboundInProgress = false;
                            });
                        }, 600);
                    }, 400);
                }
            }
        }
        if (toId !== null && toId !== "bank" && players[toId]) {
            players[toId].money += amount;
            showFloatingMoney(toId, amount);
        }
        updatePlayersDisplay();
        if (callback) callback();
    });
}

// ==========================================
// 2. بطاقات ضربة الحظ
// ==========================================

const chanceCards = [
    { id: "share_luck", name: "نصيبك ونصيبي", icon: "🎴", image: null, text: "اسحب بطاقتين.. اختر واحدة لك، والثانية ستذهب قسراً للاعب آخر عشوائي", type: "interactive", effect: "share_luck" },
    { id: "dice_double", name: "قوة النرد", icon: "🎲", image: null, text: "نتيجة النرد في دورك القادم ستكون مضاعفة", type: "strategic", effect: "dice_double" },
    { id: "triple_rent", name: "العقار الذهبي ×3", icon: "💎", image: null, text: "اختر مدينة ستتحول إيجارها إلى ×3", type: "strategic", effect: "triple_rent" },
    { id: "annoying_neighbor", name: "الجار المزعج", icon: "🏠", image: null, text: "أقرب لاعب لك لن يتمكن من شراء مدن أو تطويرها حتى يمر بالبداية مرتين", type: "strategic", effect: "annoying_neighbor" },
    { id: "hot_seat", name: "الكرسي الساخن", icon: "🪑", image: null, text: "بدّل مكانك مع اللاعب الأقرب للبداية", type: "interactive", effect: "hot_seat" },
    { id: "poisoned_gift", name: "الهدية المسمومة", icon: "🎁", image: null, text: "ستعطي كل لاعب 100 الآن.. لكن كل لاعب يمر بنقطة البداية قبلك يعطيك 200", type: "strategic", effect: "poisoned_gift" },
    { id: "double_draw", name: "حظ الحظوظ", icon: "✨", image: null, text: "اسحب بطاقتين", type: "reward", effect: "double_draw" },
    { id: "reverse_card", name: "كل شيء بالمقلوب", icon: "🙃", image: null, text: "اسحب بطاقة أخرى.. لكن تأثيرها سيصبح معكوس", type: "interactive", effect: "reverse_card" },
    { id: "suspicious_gift", name: "الهدية المشبوهة", icon: "💰", image: null, text: "خذ 500 الآن.. لكن لو خسرت أي مبلغ، تدفع 700", type: "strategic", effect: "suspicious_gift" },
    { id: "time_running_out", name: "الوقت ينفد", icon: "⏳", image: null, text: "لديك فرصة 3 مرات مرور بالبداية حتى تصل لبوابة العالم.. لو لم تفعل، تخسر 700", type: "strategic", effect: "time_running_out" },
    { id: "fortune_swap", name: "تقلّب الأقدار", icon: "🔄", image: null, text: "الأغنى يبدل 30% من أمواله مع الأفقر", type: "interactive", effect: "fortune_swap" },
    { id: "wrong_move", name: "الحركة الخطأ", icon: "🚶", image: null, text: "تحرك 4 خطوات للخلف ← 2 للأمام ← 2 للخلف ← 4 للأمام", type: "move", effect: "wrong_move" },
    { id: "double_rent_all", name: "الإيجار المضاعف", icon: "💵", image: null, text: "كل مدنك الحالية تأخذ إيجار مضاعف ×2", type: "reward", effect: "double_rent_all" },
    { id: "earthquake", name: "الزلزال", icon: "💥", image: null, text: "اختر مدينة لشخص آخر ليخسرها", type: "interactive", effect: "earthquake" },

    { id: "rocket_launch", name: "انطلق بصاروخ!", icon: "🚀", image: null, text: "تقدم 12 خانة", type: "move", effect: "move_forward", steps: 12 },
    { id: "back_to_start", name: "عد إلى البداية", icon: "🏁", image: null, text: "ارجع للبداية وخذ أجر المرور", type: "move", effect: "back_to_start" },
    { id: "go_jail", name: "المحطة السوداء", icon: "💀", image: null, text: "اذهب إلى المحطة السوداء", type: "loss", effect: "go_jail" },
    { id: "go_airport", name: "بوابة العالم", icon: "✈️", image: null, text: "اذهب لبوابة العالم", type: "move", effect: "go_airport" },
    { id: "teleport_to_player", name: "تبديل خفي", icon: "🎭", image: null, text: "سيتم نقلك للاعب عشوائي", type: "interactive", effect: "teleport_to_player" },
    { id: "teleport_to_building", name: "زيارة مفاجئة", icon: "🏘️", image: null, text: "سيتم نقلك لمبنى عشوائي", type: "move", effect: "teleport_to_building" },
    { id: "random_tp", name: "هروب مفاجئ", icon: "🌀", image: null, text: "سيتم نقلك لمكان عشوائي، رحلة سعيدة!", type: "move", effect: "random_tp" },
    { id: "half_their_wealth", name: "نصف ثروتهم.. لك!", icon: "💰", image: null, text: "كل لاعب يدفعلك 50% من ثروته", type: "reward", effect: "half_their_wealth" },
    { id: "half_your_wealth", name: "نصف ثروتك.. عليك!", icon: "💸", image: null, text: "وزع 50% من ثروتك على اللاعبين", type: "loss", effect: "half_your_wealth" },
    { id: "swap_places", name: "مقايضة الأماكن", icon: "🔀", image: null, text: "سيتم تبديل مكانك مع لاعب عشوائي", type: "interactive", effect: "swap_places" },
    { id: "swap_property", name: "صفقة عقارية", icon: "🏛️", image: null, text: "سيتم تبديل عقار تملكه بعقار شخص آخر.. عشوائياً!", type: "interactive", effect: "swap_property" },

    { id: "rewind_time", name: "الزمن عاد للوراء", icon: "⏰", image: null, text: "عد للخانة التي كنت عليها قبل وصولك لهنا", type: "move", effect: "rewind_time" },
    { id: "smart_tenant", name: "المستأجر الذكي", icon: "🏦", image: null, text: "ستأخذ مجموع كل إيجار لديك حالياً", type: "reward", effect: "smart_tenant" },
    { id: "rent_curse", name: "لعنة الإيجار", icon: "🌫️", image: null, text: "حتى تلمس نقطة البداية مرتين.. إذا وقع أحد على أغلى مدينة لديك، أنت من ستدفع له إيجارها", type: "loss", effect: "rent_curse" },
    { id: "luck_wave", name: "موجة الحظ", icon: "🌊", image: null, text: "يحصل كل اللاعبين على بطاقة حظ عشوائية", type: "reward", effect: "luck_wave" },
    { id: "lifetime_deal", name: "صفقة العمر", icon: "💼", image: null, text: "ادفع 200 واحصل على مدينة عشوائية غير مملوكة", type: "reward", effect: "lifetime_deal" },
    { id: "life_saver", name: "طوق النجاة", icon: "🛟", image: null, text: "احتفظ بهذه البطاقة.. عندما تقل ثروتك عن 200، ستحصل على 500!", type: "strategic", effect: "life_saver" },
    { id: "guaranteed_gain", name: "المكسب المضمون", icon: "🎯", image: null, text: "أول لاعب يمر بنقطة البداية يدفع لك 250", type: "strategic", effect: "guaranteed_gain" },
    { id: "time_bomb", name: "القنبلة الموقوتة", icon: "💣", image: null, text: "ستنفجر هذه البطاقة بعد 3 أدوار لك وتحرق 400 عملة لديك!", type: "loss", effect: "time_bomb" },
    { id: "treasury_debt", name: "دين الخزينة", icon: "📜", image: null, text: "عليك دين لنا قدره 500.. سنأخذه منك عندما تمر بنقطة البداية", type: "loss", effect: "treasury_debt" }
];

// ==========================================
// 3. عناصر الصفحة
// ==========================================

const splashScreen = document.getElementById("splash-screen");
const lobbyScreen  = document.getElementById("lobby-screen");
const gameScreen   = document.getElementById("game-screen");
const startBtn     = document.getElementById("start-btn");
const playBtn      = document.getElementById("play-btn");
const backBtn      = document.getElementById("back-btn");
const gameBoard    = document.getElementById("game-board");

// ==========================================
// 4. بدء التطبيق
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    const loaded = await loadPlayerDataFromServer();
    if (!loaded) return;

    
    // ✅ زر مغادرة المجموعة — ربط دائم
    const _attachLeaveParty = () => {
        const btn = document.getElementById('leave-party-btn');
        if (!btn) return;
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🚪 leave clicked');
            if (!confirm('هل تريد مغادرة المجموعة؟')) return;
            socket.emit('lobby:leave', {});
            setMessage('🚪 جاري مغادرة المجموعة...');
        });
        console.log('✅ leave-party-btn bound');
    };
    _attachLeaveParty();
    setInterval(_attachLeaveParty, 2000);

    // ✅ أزرار دعوة اللوبي — ربط دائم
    const _attachLobbyInviteButtons = () => {
        const acceptBtn = document.getElementById('lobby-invite-accept');
        const rejectBtn = document.getElementById('lobby-invite-reject');

        if (acceptBtn && acceptBtn.dataset.bound !== '1') {
            acceptBtn.dataset.bound = '1';
            acceptBtn.addEventListener('click', () => {
                if (!activeLobbyInvite) return;
                socket.emit('lobby:invite_accept', { invite_id: activeLobbyInvite.invite_id });
                document.getElementById('lobby-invite-notification').classList.add('hidden');
                activeLobbyInvite = null;
            });
        }
        if (rejectBtn && rejectBtn.dataset.bound !== '1') {
            rejectBtn.dataset.bound = '1';
            rejectBtn.addEventListener('click', () => {
                if (!activeLobbyInvite) return;
                socket.emit('lobby:invite_reject', { invite_id: activeLobbyInvite.invite_id });
                document.getElementById('lobby-invite-notification').classList.add('hidden');
                activeLobbyInvite = null;
            });
        }
    };
    _attachLobbyInviteButtons();
    setInterval(_attachLobbyInviteButtons, 2000);

    // ✅ ربط زر شات المجموعة
    ensureLobbyChatUI();

    const logoutBtn = document.getElementById("logout-btn");
    
    if (logoutBtn) logoutBtn.onclick = logoutPlayer;

    if (playerData.isAdmin) {
        const adminBtn = document.getElementById("admin-btn");
        if (adminBtn) adminBtn.style.display = "flex";
    }

    updateLobbyUI();

    if (startBtn) startBtn.onclick = () => {
        const name = playerData.name || "لاعب";
        playerData.name = name;
        players[0].name = name;
        splashScreen.classList.add("hidden");
        lobbyScreen.classList.remove("hidden");
        updateLobbyUI();
    };

    if (playBtn) playBtn.onclick = () => {
        // ✅ تحقق: الليدر فقط
        if (currentParty && currentParty.members && currentParty.members.length > 1) {
            const leader = currentParty.members[0];
            const isLeader = String(leader.id) === String(playerData.userId);
            if (!isLeader) {
                alert('⚠️ القائد فقط يمكنه بدء اللعب');
                return;
            }
        }
        showPlayTypeScreen();
    };

    if (backBtn) backBtn.onclick = () => {
        stopTimer();
        cancelAirportSelection();
        cancelDoubleRentSelection(true);
        cancelFreeUpgradeSelection(true);
        gameSession.active = false;
        gameSession.moving = false;
        gameScreen.classList.add("hidden");
        lobbyScreen.classList.remove("hidden");
    };

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (gameSession.airportSelecting) cancelAirportSelection();
            if (gameSession.doubleRentSelecting) cancelDoubleRentSelection(false);
            if (gameSession.freeUpgradeSelecting) cancelFreeUpgradeSelection(true);
            const infoModal = document.getElementById("player-info-modal");
            if (infoModal) infoModal.remove();
            const tileInfo = document.getElementById("tile-info-dialog");
            if (tileInfo) tileInfo.remove();
            const planDialog = document.getElementById("plan-choice-dialog");
            if (planDialog) planDialog.remove();
        }
    });
});
    // ✅ أزرار دعوة اللوبي
    const lobbyAcceptBtn = document.getElementById('lobby-invite-accept');
    if (lobbyAcceptBtn) {
        lobbyAcceptBtn.onclick = () => {
            if (!activeLobbyInvite) return;
            socket.emit('lobby:invite_accept', { invite_id: activeLobbyInvite.invite_id });
            document.getElementById('lobby-invite-notification').classList.add('hidden');
            activeLobbyInvite = null;
        };
    }

// ==========================================
// 5. شاشات اختيار الوضع
// ==========================================

function showPlayTypeScreen() {
    lobbyScreen.classList.add("hidden");
    const screen = document.getElementById("play-type-screen");
    if (!screen) { showModeScreen(); return; }
    screen.classList.remove("hidden");

    const inParty = currentParty && currentParty.members && currentParty.members.length > 1;

    screen.querySelectorAll(".play-type-card").forEach(card => {
        const type = card.dataset.type;

        // ✅ منع "مع البوتات" لو في party
        if (inParty && type === 'bots') {
            card.style.opacity = "0.4";
            card.style.pointerEvents = "none";
            card.title = "لا يمكن اللعب مع البوتات وأنت في مجموعة";
            return;
        }

        card.style.opacity = "1";
        card.style.pointerEvents = "auto";
        card.title = "";

        card.onclick = () => {
            playModeType = type;
            screen.classList.add("hidden");
            showModeScreen();
        };
    });

    const backBtn2 = document.getElementById("play-type-back-btn");
    if (backBtn2) backBtn2.onclick = () => {
        screen.classList.add("hidden");
        lobbyScreen.classList.remove("hidden");
    };
}
function showModeScreen() {
    lobbyScreen.classList.add("hidden");
    const modeScreen = document.getElementById("mode-screen");
    if (!modeScreen) { startRPS(); return; }
    modeScreen.classList.remove("hidden");

    const titleEl = modeScreen.querySelector(".mode-title");
    if (titleEl) {
        const names = {
            friends: "اللعب مع الأصدقاء",
            bots:    "اللعب مع البوتات",
            random:  "اللعب العشوائي"
        };
        titleEl.textContent = names[playModeType] || "اختر وضع اللعب";
    }

    // ✅ عدد أفراد المجموعة
    const partyCount = (currentParty && currentParty.members) ? currentParty.members.length : 0;
    const inParty = partyCount > 1;

    modeScreen.querySelectorAll(".mode-card").forEach(card => {
        const mode = card.dataset.mode;
        const modeCapacity = getModeCapacity(mode);

        // ✅ إعادة ضبط
        card.style.opacity = "1";
        card.style.pointerEvents = "auto";
        card.title = "";

        // ✅ منع الأوضاع الأصغر من عدد المجموعة
        if (inParty && modeCapacity < partyCount) {
            card.style.opacity = "0.4";
            card.style.pointerEvents = "none";
            card.title = `هذا الوضع يحتاج ${modeCapacity} لاعبين فقط`;
            card.onclick = null;
            return;
        }

        // ✅ منع 2v2 لو المجموعة أكتر من 2
        if (inParty && mode === '2v2' && partyCount > 2) {
            card.style.opacity = "0.4";
            card.style.pointerEvents = "none";
            card.title = "وضع 2v2 يقبل حتى لاعبَين في المجموعة";
            card.onclick = null;
            return;
        }

        card.onclick = () => {
            gameMode = mode;

            if (mode === '2v2') {
                modeScreen.classList.add("hidden");
                showTeamSelectScreen();
                return;
            }

            if (playModeType === 'friends') {
                modeScreen.classList.add("hidden");
                createFriendsRoom(mode, null);
                return;
            }

            if (playModeType === 'random') {
                modeScreen.classList.add("hidden");
                startMatchmaking(mode);
                return;
            }

            setupGameMode();
            modeScreen.classList.add("hidden");
            startRPS();
        };
    });

    const modeBackBtn = document.getElementById("mode-back-btn");
    if (modeBackBtn) modeBackBtn.onclick = () => {
        modeScreen.classList.add("hidden");
        showPlayTypeScreen();
    };
}
function showTeamSelectScreen() {
    hideAllScreens();
    const screen = document.getElementById('team-select-screen');
    screen.classList.remove('hidden');

    screen.querySelectorAll('.team-select-btn').forEach(btn => {
        btn.onclick = () => {
            const teamIdx = parseInt(btn.dataset.team);
            screen.classList.add('hidden');

            if (playModeType === 'friends') {
                createFriendsRoom('2v2', teamIdx);
            } else if (playModeType === 'random') {
                startMatchmaking('2v2');
            } else {
                startLocal2v2Bots(teamIdx);
            }
        };
    });

    const backBtn = document.getElementById('team-select-back-btn');
    if (backBtn) backBtn.onclick = () => {
        screen.classList.add('hidden');
        document.getElementById('mode-screen').classList.remove('hidden');
    };
}

function startLocal2v2Bots(teamIdx) {
    activePlayerIds = [0, 1, 2, 3];

    if (teamIdx === 0) {
        teams = [[0, 1], [2, 3]];
    } else {
        teams = [[1, 2], [0, 3]];
    }

    const availableChars = charactersData.slice();
    players.forEach(p => {
        if (!p.human && p.id > 0) {
            const c = availableChars[Math.floor(Math.random() * availableChars.length)];
            p.character = c.id;
            p.characterName = c.name;
            p.characterImage = c.image || null;
            p.characterAvatar = c.cardImage || c.image || null;
            p.characterPassives = c.passives || [];
        }
    });

    startRPS();
}
function setupGameMode() {
    switch (gameMode) {
        case "1v1": activePlayerIds = [0, 1]; teams = null; break;
        case "1v1v1": activePlayerIds = [0, 1, 2]; teams = null; break;
        case "1v1v1v1": activePlayerIds = [0, 1, 2, 3]; teams = null; break;
        case "2v2": activePlayerIds = [0, 1, 2, 3]; teams = [[0, 1], [2, 3]]; break;
        default: activePlayerIds = [0, 1, 2, 3]; teams = null;
    }

    const availableChars = charactersData.slice();
    players.forEach(p => {
        if (!p.human && p.id > 0) {
            const c = availableChars[Math.floor(Math.random() * availableChars.length)];
            p.character = c.id;
            p.characterName = c.name;
            p.characterImage = c.image || null;
            p.characterAvatar = c.cardImage || c.image || null;
            p.characterPassives = c.passives || [];
        }
    });

    console.log('🤖 Bot characters:', players.filter(p => !p.human).map(p => `${p.name}=${p.character}`));
}

// ==========================================
// 6. اللوبي
// ==========================================

function updateLobbyUI() {
    const nameEl  = document.getElementById("player-name");
    const levelEl = document.getElementById("player-level");
    const moneyEl = document.getElementById("money");
    const gemsEl  = document.getElementById("gems");
    const heroImageEl = document.getElementById("hero-image");

    if (nameEl) nameEl.textContent = playerData.name;
    if (levelEl) levelEl.textContent = playerData.level;
    if (moneyEl) moneyEl.textContent = playerData.money;
    if (gemsEl)  gemsEl.textContent  = playerData.gems;

    if (heroImageEl) {
        const avatarSrc = playerData.characterAvatar || playerData.characterImage;
        if (avatarSrc) {
            heroImageEl.innerHTML = `<img src="${avatarSrc}" alt="${playerData.characterName || ''}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
        } else {
            heroImageEl.innerHTML = `<div class="temporary-character">
                <div class="character-head"></div>
                <div class="character-body">
                    <div class="character-scarf"></div>
                    <div class="character-bag"></div>
                </div>
            </div>`;
        }
    }
}

// ==========================================
// 7. الخريطة
// ==========================================

const boardTiles = [
    { name: "البداية", type: "start" },
    { name: "فالورا", type: "property", price: 140, rent: 18, upgradePrice: 170, image: "/static/images/cities/city_falora.png" },
    { name: "مونتيرا", type: "property", price: 160, rent: 21, upgradePrice: 190, image: "/static/images/cities/city_montira.png" },
    { name: "خزينة المدينة", type: "chest" },
    { name: "أورفيكا", type: "property", price: 180, rent: 24, upgradePrice: 215, image: "/static/images/cities/city_orfika.png" },
    { name: "ضربة حظ", type: "chance" },
    { name: "محطة نوفا", type: "station", price: 150, rent: 25 },
    { name: "سيلفارا", type: "property", price: 280, rent: 40, upgradePrice: 340, image: "/static/images/cities/city_silvara.png" },
    { name: "المحطة السوداء", type: "jail" },
    { name: "إلورا", type: "property", price: 200, rent: 27, upgradePrice: 240, image: "/static/images/cities/city_elora.png" },
    { name: "فيرونا", type: "property", price: 220, rent: 30, upgradePrice: 265, image: "/static/images/cities/city_verona.png" },
    { name: "خزينة المدينة", type: "chest" },
    { name: "أستيرا", type: "property", price: 240, rent: 33, upgradePrice: 290, image: "/static/images/cities/city_astera.png" },
    { name: "كريستال باي", type: "property", price: 260, rent: 36, upgradePrice: 315, image: "/static/images/cities/city_kristal.png" },
    { name: "ضربة حظ", type: "chance" },
    { name: "محطة أوربت", type: "station", price: 150, rent: 25 },
    { name: "بوابة العالم", type: "airport" },
    { name: "بلاكستون", type: "property", price: 360, rent: 50, upgradePrice: 430, image: "/static/images/cities/city_blackstone.png" },
    { name: "جولدن ديستريكت", type: "property", price: 380, rent: 54, upgradePrice: 455, image: "/static/images/cities/city_golden.png" },
    { name: "إمبيريا", type: "property", price: 420, rent: 62, upgradePrice: 505, image: "/static/images/cities/city_imperia.png" },
    { name: "أوريون", type: "property", price: 660, rent: 100, upgradePrice: 770, image: "/static/images/cities/city_orion.png" },
    { name: "كراون سيتي", type: "property", price: 620, rent: 92, upgradePrice: 730, image: "/static/images/cities/city_crown.png" },
    { name: "ضربة حظ", type: "chance" },
    { name: "بقشيش", type: "tip", amount: 30 },
    { name: "مضاعفة الأرباح", type: "double_rent" },
    { name: "سكاي لاين", type: "property", price: 400, rent: 58, upgradePrice: 480, image: "/static/images/cities/city_skyline.png" },
    { name: "رويال أفينيو", type: "property", price: 320, rent: 45, upgradePrice: 385, image: "/static/images/cities/city_royal.png" },
    { name: "خزينة المدينة", type: "chest" },
    { name: "ستارلايت", type: "property", price: 550, rent: 80, upgradePrice: 650, image: "/static/images/cities/city_starlight.png" },
    { name: "ميرافا", type: "property", price: 700, rent: 108, upgradePrice: 820, image: "/static/images/cities/city_mirava.png" },
    { name: "فيلورا", type: "property", price: 450, rent: 67, upgradePrice: 540, image: "/static/images/cities/city_filora.png" },
    { name: "محطة أسترا", type: "station", price: 150, rent: 25 }
];

boardTiles.forEach(t => {
    if (t.type === "property" || t.type === "station") { t.owner = null; t.level = null; }
    if (t.type === "property") t.rentMultiplier = 1;
});

function assignTileRegions() {
    const regionMap = [
        { from: 1, to: 4, region: 3 }, { from: 5, to: 8, region: 0 },
        { from: 9, to: 13, region: 1 }, { from: 14, to: 16, region: 4 },
        { from: 17, to: 22, region: 2 }, { from: 23, to: 24, region: 6 },
        { from: 25, to: 29, region: 5 }, { from: 30, to: 31, region: 7 }
    ];
    regionMap.forEach(({ from, to, region }) => {
        for (let i = from; i <= to; i++) {
            if (boardTiles[i]) boardTiles[i].region = region;
        }
    });
}
assignTileRegions();

const playerTokens = [];
const tileElements = [];

// ==========================================
// 8. رسم الخريطة
// ==========================================

function createMap() {
    if (!gameBoard) return;
    gameBoard.innerHTML = "";
    playerTokens.length = 0;
    tileElements.length = 0;

    boardTiles.forEach((tile, index) => {
        const pos = getTilePosition(index);
        const cell = document.createElement("div");
        cell.className = "map-tile tile-" + tile.type;
        cell.dataset.index = index;
        cell.style.gridRow = pos.row;
        cell.style.gridColumn = pos.col;
        cell.dataset.row = pos.row;
        cell.dataset.col = pos.col;

        if (tile.region !== undefined) cell.dataset.region = tile.region;

        cell.innerHTML = `<div class="tile-name">${tile.name}</div>`;

        if (tile.type === "property" || tile.type === "station") {
            cell.classList.add("tile-clickable");
        }

        cell.addEventListener("click", (e) => {
            if (gameSession.airportSelecting ||
                gameSession.doubleRentSelecting ||
                gameSession.freeUpgradeSelecting) return;
            if (document.getElementById("buy-dialog") ||
                document.getElementById("upgrade-dialog") ||
                document.getElementById("steal-dialog") ||
                document.getElementById("free-upgrade-dialog")) return;
            if (tile.type === "property" || tile.type === "station") {
                showTileInfoDialog(index);
            }
        });

        gameBoard.appendChild(cell);
        tileElements.push(cell);
    });

    const center = document.createElement("div");
    center.className = "map-center";
    center.innerHTML = `
        <div id="game-controls" class="game-dice-area">
            <div id="current-turn-name" class="current-turn-name"></div>
            <div id="dice-timer" class="decision-timer"></div>
            <div class="dice-results">
                <div class="dice" id="dice-one">1</div>
                <div class="dice" id="dice-two">1</div>
            </div>
            <button id="roll-dice-btn" class="roll-dice-btn" onclick="rollDice()" type="button">ارم النرد</button>
            <div id="game-message" class="game-message"></div>
        </div>
    `;
    gameBoard.appendChild(center);

    getActivePlayers().forEach((player) => {
        const token = createToken(player);
        playerTokens[player.id] = token;
        if (tileElements[0]) tileElements[0].appendChild(token);
    });

    boardTiles.forEach((tile, index) => {
        if (tile.owner !== null && tile.owner !== undefined) updateTileVisual(index);
    });

    createPlayersDisplay();
    updateActiveToken();
}

function getTilePosition(index) {
    if (index <= 8) return { row: 1, col: index + 1 };
    if (index <= 16) return { row: index - 7, col: 9 };
    if (index <= 24) return { row: 9, col: 25 - index };
    return { row: 33 - index, col: 1 };
}

// ==========================================
// 📊 نافذة معلومات العقار
// ==========================================

function showTileInfoDialog(index) {
    const tile = boardTiles[index];
    if (!tile) return;
    const old = document.getElementById("tile-info-dialog");
    if (old) old.remove();

    const isStation = tile.type === "station";
    const isOwned = tile.owner !== null && tile.owner !== undefined;
    const ownerName = isOwned ? players[tile.owner].name : "غير مملوك";
    const isMine = isOwned && tile.owner === 0;

    let levelInfo = "";
    if (!isStation) {
        if (tile.level === "house") levelInfo = "🏠 منزل";
        else if (tile.level === "building") levelInfo = "🏢 مبنى فاخر";
        else levelInfo = "🌱 أرض فاضية";
    } else levelInfo = "🚉 محطة";

    const currentRent = isOwned ? getRentByLevel(tile) : (tile.rent || 0);

    let rentLine = isOwned
        ? `الإيجار الحالي: <b style="color:#ff8c00;">${currentRent}$</b>`
        : `الإيجار الأساسي: <b style="color:#ff8c00;">${currentRent}$</b>`;

    let actionLine = "";
    if (isMine) {
        if (!isStation && tile.level === "house") {
            const upPrice = getUpgradePrice(tile);
            actionLine = `💡 <b>أنت المالك</b> — يمكنك ترقيتها إلى مبنى فاخر بمبلغ <b style="color:#4dff88;">${upPrice}$</b> عند المرور عليها`;
        } else if (!isStation && tile.level === "building") {
            actionLine = `🏆 <b>أنت المالك</b> — مطورة بالكامل`;
        } else actionLine = `✅ <b>أنت المالك</b>`;
    } else if (isOwned) {
        actionLine = `💸 إذا توقفت هنا ستدفع <b style="color:#ff4d4d;">${currentRent}$</b> إلى <b>${ownerName}</b>`;
    } else {
        actionLine = `🛒 إذا توقفت هنا يمكنك شراءها بمبلغ <b style="color:#4dff88;">${tile.price}$</b>`;
    }

    const borderColor = isMine ? "#4dff88" : (isOwned ? "#ffd84d" : "#789bc0");

    const dialog = document.createElement("div");
    dialog.id = "tile-info-dialog";
    dialog.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 999997; padding: 20px; direction: rtl; font-family: Arial, sans-serif;`;

    const multBadge = (tile.type === "property" && tile.rentMultiplier && tile.rentMultiplier > 1)
        ? `<div style="color:#BA68C8; font-size:14px; font-weight:900; margin-top: 4px;">🚀 مضاعف ×${tile.rentMultiplier}</div>` : '';

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 3px solid ${borderColor}; border-radius: 20px; padding: 24px 28px; min-width: 280px; max-width: 400px; width: 100%; text-align: center; color: #fff; box-shadow: 0 20px 60px rgba(0,0,0,0.9);">
            <div style="font-size: 26px; font-weight: 900; color: #ffd84d; margin-bottom: 4px; text-shadow: 0 0 20px rgba(255,216,77,0.4);">${tile.name}</div>
            <div style="font-size: 13px; color: #aaa; margin-bottom: 16px;">${levelInfo}</div>
            <div style="font-size: 15px; margin: 8px 0; color: ${isMine ? '#4dff88' : (isOwned ? '#ff8c00' : '#ccc')};">
                المالك: <b>${isOwned ? (isMine ? 'أنت ✅' : ownerName) : 'غير مملوك'}</b>
            </div>
            <div style="font-size: 15px; margin: 8px 0;">${rentLine}</div>
            ${multBadge}
            <div style="margin: 18px 0; padding: 14px; background: rgba(255,216,77,0.08); border: 1px solid rgba(255,216,77,0.2); border-radius: 12px; font-size: 14px; line-height: 1.7; color: #ddd;">
                ${actionLine}
            </div>
            <button id="tile-info-close" type="button" style="width: 100%; padding: 12px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #ffd84d, #d6a928); color: #0d091b; font-family: inherit;">إغلاق</button>
        </div>
    `;
    document.body.appendChild(dialog);
    document.getElementById("tile-info-close").onclick = () => dialog.remove();
    dialog.onclick = (e) => { if (e.target === dialog) dialog.remove(); };
}

// ==========================================
// 9. رمز اللاعب
// ==========================================
function createToken(player) {
    const token = document.createElement("div");
    token.className = "player-token";
    if (player.is_bot) token.classList.add("bot-token");
    token.dataset.playerId = player.id;

    let imgSrc = null;
    let charName = player.name;

    if (player.human) {
        imgSrc = playerData.characterImage;
        charName = playerData.characterName || player.name;
    } else {
        imgSrc = player.characterImage;
        charName = player.characterName || player.name;
    }

    if (imgSrc) {
        token.innerHTML = `<img src="${imgSrc}" alt="${charName}" class="character-img" onerror="this.style.display='none'">`;
    } else {
        token.innerHTML = `<div class="temporary-character">
            <div class="character-head"></div>
            <div class="character-body">
                <div class="character-scarf"></div>
                <div class="character-bag"></div>
            </div>
        </div>`;
    }
    return token;
}
function updateToken(player) {
    const token = playerTokens[player.id];
    const tile = tileElements[player.position];
    if (!token || !tile) return;

    tileElements.forEach(el => {
        if (el !== tile && !el.querySelector(".player-token")) {
            el.classList.remove("has-player-token");
        }
    });

    tile.appendChild(token);
    tile.classList.add("has-player-token");
}

function updateActiveToken() {
    playerTokens.forEach((token, id) => {
        if (!token) return;
        token.classList.toggle("active-turn-player", id === gameSession.currentPlayer);
    });
}

// ==========================================
// 10. زوايا اللاعبين
// ==========================================

function createPlayersDisplay() {
    const old = document.getElementById("players-display");
    if (old) old.remove();
    const display = document.createElement("div");
    display.id = "players-display";
    display.className = "players-display mode-" + gameMode;
    gameScreen.appendChild(display);
    updatePlayersDisplay();
}

function updatePlayersDisplay() {
    const display = document.getElementById("players-display");
    if (!display) return;
    display.innerHTML = "";
    display.className = "players-display mode-" + gameMode;

    getActivePlayers().forEach((player, idx) => {
        const card = document.createElement("div");
        card.className = "player-corner player-corner-" + (idx + 1);
        card.dataset.playerId = player.id;

        if (gameMode === "2v2") {
            let teamIdx = player.team_idx;
            if (teamIdx === undefined || teamIdx === null) {
                if (teams) {
                    if (teams[0].includes(player.id)) teamIdx = 0;
                    else if (teams[1].includes(player.id)) teamIdx = 1;
                }
            }
            if (teamIdx === 0) card.classList.add("team-a");
            else if (teamIdx === 1) card.classList.add("team-b");
        }
                if (player.id === gameSession.currentPlayer && player.alive !== false) card.classList.add("active");
        if (player.alive === false) card.classList.add("dead");

        let jailBadge = "";
        if (player.jailTurns > 0) {
            jailBadge = `<div style="font-size:10px; color:#ff4d4d; font-weight:900;">${player.jailTurns}</div>`;
        }

        let imgSrc = null;
        let charName = player.name;
        if (player.human) {
            imgSrc = playerData.characterAvatar || playerData.characterImage;
            charName = playerData.characterName || player.name;
        } else {
            imgSrc = player.characterAvatar || player.characterImage;
            charName = player.characterName || player.name;
        }

        let avatarContent;
        if (imgSrc) {
            avatarContent = `<img src="${imgSrc}" alt="${charName}" class="character-img" onerror="this.style.display='none'">`;
        } else {
            avatarContent = `<div class="temporary-character">
                <div class="character-head"></div>
                <div class="character-body">
                    <div class="character-scarf"></div>
                    <div class="character-bag"></div>
                </div>
            </div>`;
        }

        const botBadge = player.is_bot
            ? `<div style="position:absolute; top:-6px; right:-6px; background:linear-gradient(135deg,#4a9fe8,#2a6fb8); color:#fff; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; box-shadow:0 0 8px rgba(74,159,232,0.9);">🤖</div>`
            : '';

        card.innerHTML = `
            <div class="player-corner-avatar" data-player-id="${player.id}" style="position:relative;">
                ${avatarContent}
                ${botBadge}
            </div>
            <div class="player-corner-money">${player.money} $</div>
            ${jailBadge}
        `;
                const avatarEl = card.querySelector(".player-corner-avatar");
        if (avatarEl) {
            avatarEl.addEventListener("click", (e) => {
                e.stopPropagation();
                openPlayerInfo(player.id);
            });
        }
        display.appendChild(card);
    });

    updateStrategicCardsDisplay();
}

// ==========================================
// 🎴 البطاقات الاستراتيجية بجانب اللاعب
// ==========================================

function getPlayerStrategicCards(player) {
    const cards = [];
    
    if (player._diceDoubleNextTurn) {
        cards.push({ icon: "🎲", name: "قوة النرد", desc: "النرد التالي ×2", type: "buff" });
    }
    if (player._lifeSaverCard) {
        cards.push({ icon: "🛟", name: "طوق النجاة", desc: "احصل على 500$ عندما يقل مالك عن 200$", type: "buff" });
    }
    if (player._guaranteedGain) {
        cards.push({ icon: "🎯", name: "المكسب المضمون", desc: "أول لاعب يمر بالبداية يدفع لك 250$", type: "buff" });
    }
    if (player._timeBombTurns > 0) {
        cards.push({ icon: "💣", name: "القنبلة الموقوتة", desc: `بعد ${player._timeBombTurns} أدوار ستخسر 400$`, type: "debuff", counter: player._timeBombTurns });
    }
    if (player._treasuryDebt) {
        cards.push({ icon: "📜", name: "دين الخزينة", desc: `${player._treasuryDebt}$ تُخصم عند مرورك بالبداية`, type: "debuff" });
    }
    if (player._poisonedGift) {
        cards.push({ icon: "🎁", name: "الهدية المسمومة", desc: "كل لاعب يمر بالبداية يعطيك 200$", type: "buff" });
    }
    if (player._suspiciousGift && player._suspiciousGift.active) {
        cards.push({ icon: "💰", name: "الهدية المشبوهة", desc: "لو خسرت أي مبلغ، تدفع 700$", type: "debuff" });
    }
    if (player._timeRunningOut && !player._timeRunningOut.success) {
        const remaining = 3 - ((player._startLaps || 0) - player._timeRunningOut.startLaps);
        cards.push({ icon: "⏳", name: "الوقت ينفد", desc: `متبقي ${Math.max(0, remaining)} مرات مرور للوصول للمطار`, type: "debuff", counter: Math.max(0, remaining) });
    }
    if (player._annoyingNeighborCard) {
        const target = players[player._annoyingNeighborCard.target];
        cards.push({ icon: "🏠", name: "الجار المزعج", desc: `${target ? target.name : "لاعب"} ممنوع من الشراء`, type: "strategic" });
    }
    const isNeighborTarget = players.some(o => o._annoyingNeighborCard && o._annoyingNeighborCard.target === player.id);
    if (isNeighborTarget) {
        cards.push({ icon: "🚫", name: "ممنوع الشراء", desc: "لا يمكنك شراء أو ترقية حتى تمر بالبداية مرتين", type: "debuff" });
    }
    if (player._rentCurse) {
        const t = boardTiles[player._rentCurse.tileIndex];
        cards.push({ icon: "🌫️", name: "لعنة الإيجار", desc: `${t.name} ملعونة — باقي ${player._rentCurse.remainingLaps} مرور`, type: "debuff", counter: player._rentCurse.remainingLaps });
    }
    return cards;
}

function updateStrategicCardsDisplay() {
    getActivePlayers().forEach((player, idx) => {
        const card = document.querySelector('.player-corner-' + (idx + 1));
        if (!card) return;
        
        const old = card.querySelector('.player-strategic-cards');
        if (old) old.remove();
        
        const cards = getPlayerStrategicCards(player);
        if (cards.length === 0) return;
        
        const container = document.createElement('div');
        container.className = 'player-strategic-cards';
        
        cards.forEach(c => {
            const badge = document.createElement('div');
            badge.className = 'strategic-card-badge type-' + c.type;
            badge.title = `${c.name}\n${c.desc}`;
            badge.innerHTML = `
                <span>${c.icon}</span>
                ${c.counter ? `<div class="card-counter">${c.counter}</div>` : ''}
            `;
            container.appendChild(badge);
        });
        
        card.appendChild(container);
    });
}

// ==========================================
// 11. إدارة الدور
// ==========================================

function updateTurnUI() {
    const current = players[gameSession.currentPlayer];
    if (!current) return;
    if (current.alive === false || !activePlayerIds.includes(current.id)) { nextTurn(); return; }
    if (current.jailTurns > 0) { nextTurn(); return; }

    const turnName = document.getElementById("current-turn-name");
    if (turnName) turnName.textContent = "دور " + current.name;
    const rollBtn = document.getElementById("roll-dice-btn");

    updatePlayersDisplay();
    updateActiveToken();
    stopTimer();

    if (gameSession.active && current.airportPending && !gameSession.moving) {
        if (rollBtn) rollBtn.disabled = true;
        if (turnName) turnName.textContent = "بوابة العالم - " + current.name;
        if (current.human) {
            startAirportSelection(current);
        } else {
            setTimeout(() => {
                current.airportPending = false;
                let bestIndex = -1, bestValue = -1;
                boardTiles.forEach((tile, index) => {
                    if (tile.type === "airport" || tile.type === "jail" || tile.type === "start") return;
                    if (tile.owner === null && (tile.type === "property" || tile.type === "station")) {
                        if (tile.price > bestValue) { bestValue = tile.price; bestIndex = index; }
                    }
                });
                if (bestIndex === -1) bestIndex = Math.floor(Math.random() * boardTiles.length);
                walkPlayerToTile(current, bestIndex, () => {
                    gameSession.moving = false;
                    if (current.position === 0) handleExactStartLanding(current, false);
                    else handleLanding(current, false);
                });
            }, 1000);
        }
        return;
    }

    const inOnlineRoom = (currentRoom !== null && window.serverGame !== null);

    if (gameSession.active && current.human) {
        gameSession.moving = false;
        gameSession.awaitingRoll = true;
        if (rollBtn) rollBtn.disabled = false;

        startTimer(20, () => {
            if (gameSession.awaitingRoll && gameSession.active) {
                if (inOnlineRoom) {
                    socket.emit('game:roll', { room_id: currentRoom.id });
                } else {
                    performDiceRollLocal(current);
                }
            }
        });
    } else {
        if (rollBtn) rollBtn.disabled = true;
    }

    if (gameSession.active && !current.human && !inOnlineRoom) {
        setTimeout(() => {
            if (gameSession.active && !gameSession.moving &&
                players[gameSession.currentPlayer].id === current.id) {
                performDiceRollLocal(current);
            }
        }, 1200);
    }
}

// ==========================================
// 12. بوابة العالم
// ==========================================

function startAirportSelection(player) {
    gameSession.airportSelecting = true;
    gameSession.airportPlayer = player;

    let overlay = document.getElementById("airport-overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "airport-overlay";
    overlay.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        z-index: 500; background: linear-gradient(145deg, #1a1330, #0d0919);
        border: 3px solid #789bc0; border-radius: 18px; padding: 15px 25px;
        text-align: center; color: #fff; font-family: Arial, sans-serif;
        box-shadow: 0 0 40px rgba(120,155,192,0.7), 0 15px 40px rgba(0,0,0,0.9);
        max-width: 90vw; direction: rtl;
    `;
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: 900; color: #789bc0; margin-bottom: 6px;">بوابة العالم</div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">اختر أي خانة — الشخصية ستمشي إليها خطوة بخطوة</div>
        <button id="airport-cancel-inline-btn" style="padding: 8px 20px; border: none; border-radius: 10px; background: linear-gradient(135deg, #666, #333); color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; font-family: inherit;">إلغاء</button>
    `;
    document.body.appendChild(overlay);

    tileElements.forEach((el, index) => {
        if (index === 16) return;
        if (index === player.position && index !== 16) return;
        el.classList.add("airport-selectable");
        const handler = (e) => {
            e.preventDefault(); e.stopPropagation();
            handleAirportTileClick(index);
        };
        el.onclick = handler;
        el.ontouchstart = handler;
    });

    setTimeout(() => {
        const cancelBtn = document.getElementById("airport-cancel-inline-btn");
        if (cancelBtn) cancelBtn.onclick = () => { if (gameSession.airportSelecting) cancelAirportSelection(); };
    }, 50);

    setMessage(`${player.name} - اختر الوجهة`);
}

function handleAirportTileClick(targetIndex) {
    if (!gameSession.airportSelecting) return;
    const player = gameSession.airportPlayer;
    if (!player) return;
    const targetTile = boardTiles[targetIndex];
    if (!targetTile) return;

    const overlay = document.getElementById("airport-overlay");
    if (overlay) overlay.remove();
    tileElements.forEach(el => {
        el.classList.remove("airport-selectable");
        el.onclick = null; el.ontouchstart = null;
    });
    gameSession.airportSelecting = false;
    gameSession.airportPlayer = null;
    player.airportPending = false;
    setMessage(`${player.name} مسافر إلى ${targetTile.name}`);

      walkPlayerToTile(player, targetIndex, () => {
        gameSession.moving = false;
        if (currentRoom && window.serverGame) return;
        if (player.position === 0) handleExactStartLanding(player, false);
        else handleLandingLocal(player, false);
    });
}

function cancelAirportSelection() {
    if (!gameSession.airportSelecting) return;
    const player = gameSession.airportPlayer;
    const overlay = document.getElementById("airport-overlay");
    if (overlay) overlay.remove();
    tileElements.forEach(el => {
        el.classList.remove("airport-selectable");
        el.onclick = null; el.ontouchstart = null;
    });
    gameSession.airportSelecting = false;
    gameSession.airportPlayer = null;
    if (player) { player.airportPending = false; setMessage(`${player.name} قرر البقاء`); }
    setTimeout(() => nextTurn(), 1000);
}

function walkPlayerToTile(player, targetIndex, onComplete) {
    const startIdx = player.position;
    let steps;
    if (targetIndex > startIdx) steps = targetIndex - startIdx;
    else if (targetIndex < startIdx) steps = (boardTiles.length - startIdx) + targetIndex;
    else steps = 0;

    if (steps === 0) { if (onComplete) onComplete(); return; }

    saveLastRoll(player, player.position, 0);

    gameSession.moving = true;
    let moved = 0;

    const step = () => {
        if (moved >= steps) { if (onComplete) onComplete(); return; }
        moved++;
        const oldPos = player.position;
        player.position = (player.position + 1) % boardTiles.length;

        if (player.position === 0 && oldPos !== 0 && moved < steps) {
            updateToken(player); updateActiveToken();
            onPlayerPassStart(player);
            transferMoney(null, player.id, 250, null);
            setTimeout(step, 280);
            return;
        }
        updateToken(player); updateActiveToken();
        setTimeout(step, 280);
    };
    step();
}

// ==========================================
// 13. اختيار مضاعفة الأرباح
// ==========================================

function startDoubleRentSelection(player, isDouble) {
    gameSession.doubleRentSelecting = true;
    gameSession.doubleRentPlayer = player;
    gameSession.doubleRentIsDouble = isDouble;

    let overlay = document.getElementById("double-rent-overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "double-rent-overlay";
    overlay.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        z-index: 500; background: linear-gradient(145deg, #2a1330, #1a0919);
        border: 3px solid #BA68C8; border-radius: 18px; padding: 15px 25px;
        text-align: center; color: #fff; font-family: Arial, sans-serif;
        box-shadow: 0 0 40px rgba(186,104,200,0.7);
        max-width: 90vw; direction: rtl;
    `;
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: 900; color: #E1BEE7; margin-bottom: 6px;">🚀 مضاعفة الأرباح</div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">اضغط على أحد عقاراتك</div>
        <div id="double-rent-timer-inline" style="font-size: 22px; font-weight: 900; color: #ff4d4d; margin-bottom: 10px;">10</div>
        <button id="double-rent-cancel-inline-btn" style="padding: 8px 20px; border: none; border-radius: 10px; background: linear-gradient(135deg, #666, #333); color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; font-family: inherit;">إلغاء</button>
    `;
    document.body.appendChild(overlay);

    tileElements.forEach((el, index) => {
        const t = boardTiles[index];
        if (t.type === "property" && t.owner === player.id) {
            el.classList.add("double-rent-selectable");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                handleDoubleRentTileClick(index);
            };
            el.onclick = handler;
            el.ontouchstart = handler;
        }
    });

    let remaining = 10;
    const timerEl = document.getElementById("double-rent-timer-inline");
    gameSession.doubleRentTimer = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) {
            clearDoubleRentSelectionUI();
            gameSession.doubleRentSelecting = false;
            gameSession.doubleRentPlayer = null;
            setMessage(`${player.name} تخطى المضاعفة`);
            finishLanding(player, isDouble);
        }
    }, 1000);

    setTimeout(() => {
        const cancelBtn = document.getElementById("double-rent-cancel-inline-btn");
        if (cancelBtn) cancelBtn.onclick = () => cancelDoubleRentSelection(false);
    }, 50);
}

function handleDoubleRentTileClick(targetIndex) {
    if (!gameSession.doubleRentSelecting) return;
    const player = gameSession.doubleRentPlayer;
    if (!player) return;
    const tile = boardTiles[targetIndex];
    if (!tile || tile.type !== "property" || tile.owner !== player.id) return;
    const isDouble = gameSession.doubleRentIsDouble;
    clearDoubleRentSelectionUI();
    gameSession.doubleRentSelecting = false;
    gameSession.doubleRentPlayer = null;
    applyDoubleRent(player, tile, isDouble);
}

function cancelDoubleRentSelection(silent) {
    if (!gameSession.doubleRentSelecting) return;
    const player = gameSession.doubleRentPlayer;
    const isDouble = gameSession.doubleRentIsDouble;
    clearDoubleRentSelectionUI();
    gameSession.doubleRentSelecting = false;
    gameSession.doubleRentPlayer = null;
    if (player) {
        setMessage(`${player.name} تخطى المضاعفة`);
        finishLanding(player, isDouble);
    }
}

function clearDoubleRentSelectionUI() {
    const overlay = document.getElementById("double-rent-overlay");
    if (overlay) overlay.remove();
    if (gameSession.doubleRentTimer) {
        clearInterval(gameSession.doubleRentTimer);
        gameSession.doubleRentTimer = null;
    }
    tileElements.forEach(el => {
        if (el.classList.contains("double-rent-selectable")) {
            el.classList.remove("double-rent-selectable");
            el.onclick = null; el.ontouchstart = null;
        }
    });
}

// ==========================================
// 13.b اختيار الترقية المجانية
// ==========================================

function startFreeUpgradeSelection(player, houses, isDouble) {
    gameSession.freeUpgradeSelecting = true;
    gameSession.freeUpgradePlayer = player;
    gameSession.freeUpgradeIsDouble = isDouble;

    let overlay = document.getElementById("free-upgrade-overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "free-upgrade-overlay";
    overlay.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        z-index: 500; background: linear-gradient(145deg, #0f2a1a, #091912);
        border: 3px solid #4dff88; border-radius: 18px; padding: 15px 25px;
        text-align: center; color: #fff; font-family: Arial, sans-serif;
        box-shadow: 0 0 40px rgba(77,255,136,0.7);
        max-width: 90vw; direction: rtl;
    `;
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: 900; color: #4dff88; margin-bottom: 6px;">🏠 ترقية مجانية</div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">اضغط على عقار من منازلك لترقيته عن بُعد</div>
        <div id="free-upgrade-timer-inline" style="font-size: 22px; font-weight: 900; color: #ff4d4d; margin-bottom: 10px;">10</div>
        <button id="free-upgrade-cancel-inline-btn" style="padding: 8px 20px; border: none; border-radius: 10px; background: linear-gradient(135deg, #666, #333); color: #fff; font-size: 13px; font-weight: 900; cursor: pointer; font-family: inherit;">تخطي</button>
    `;
    document.body.appendChild(overlay);

    tileElements.forEach((el, index) => {
        const t = boardTiles[index];
        if (t.type === "property" && t.owner === player.id && t.level === "house") {
            el.classList.add("free-upgrade-selectable");
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation();
                handleFreeUpgradeTileClick(index);
            };
            el.onclick = handler;
            el.ontouchstart = handler;
        }
    });

    let remaining = 10;
    const timerEl = document.getElementById("free-upgrade-timer-inline");
    gameSession.freeUpgradeTimer = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) {
            clearFreeUpgradeSelectionUI();
            gameSession.freeUpgradeSelecting = false;
            gameSession.freeUpgradePlayer = null;
            setMessage(`${player.name} تخطى المكافأة`);
            finishLanding(player, isDouble);
        }
    }, 1000);

    setTimeout(() => {
        const cancelBtn = document.getElementById("free-upgrade-cancel-inline-btn");
        if (cancelBtn) cancelBtn.onclick = () => cancelFreeUpgradeSelection(false);
    }, 50);
}

function handleFreeUpgradeTileClick(targetIndex) {
    if (!gameSession.freeUpgradeSelecting) return;
    const player = gameSession.freeUpgradePlayer;
    if (!player) return;
    const tile = boardTiles[targetIndex];
    if (!tile || tile.type !== "property" || tile.owner !== player.id || tile.level !== "house") return;

    const isDouble = gameSession.freeUpgradeIsDouble;
    clearFreeUpgradeSelectionUI();
    gameSession.freeUpgradeSelecting = false;
    gameSession.freeUpgradePlayer = null;
    freeUpgradeProperty(player, tile, isDouble);
}

function cancelFreeUpgradeSelection(silent) {
    if (!gameSession.freeUpgradeSelecting) return;
    const player = gameSession.freeUpgradePlayer;
    const isDouble = gameSession.freeUpgradeIsDouble;
    clearFreeUpgradeSelectionUI();
    gameSession.freeUpgradeSelecting = false;
    gameSession.freeUpgradePlayer = null;
    if (player) {
        setMessage(`${player.name} تخطى المكافأة`);
        if (!silent) finishLanding(player, isDouble);
    }
}

function clearFreeUpgradeSelectionUI() {
    const overlay = document.getElementById("free-upgrade-overlay");
    if (overlay) overlay.remove();
    if (gameSession.freeUpgradeTimer) {
        clearInterval(gameSession.freeUpgradeTimer);
        gameSession.freeUpgradeTimer = null;
    }
    tileElements.forEach(el => {
        if (el.classList.contains("free-upgrade-selectable")) {
            el.classList.remove("free-upgrade-selectable");
            el.onclick = null; el.ontouchstart = null;
        }
    });
}

// ==========================================
// 14. إدارة الدور - متابعة
// ==========================================

function nextTurn() {
    if (!gameSession.active) return;
    stopTimer();
    const upcomingPlayer = players[gameSession.currentPlayer];
    if (upcomingPlayer) checkStrategicCards(upcomingPlayer);
    players.forEach(p => { p._usedPlanThisTurn = false; });
    gameSession.awaitingRoll = false;
    gameSession.moving = false;

    if (gameSession.airportSelecting) { cancelAirportSelection(); return; }
    if (gameSession.doubleRentSelecting) { cancelDoubleRentSelection(false); return; }
    if (gameSession.freeUpgradeSelecting) { cancelFreeUpgradeSelection(false); return; }

    let attempts = 0;
    do {
        gameSession.currentPlayer = (gameSession.currentPlayer + 1) % players.length;
        attempts++;
        const p = players[gameSession.currentPlayer];
        if (!activePlayerIds.includes(p.id)) continue;
        if (p.alive === false) continue;

        if (p.jailTurns > 0) {
            p.jailTurns--;
            setMessage(`${p.name} في المحطة السوداء - ${p.jailTurns}`);
            updatePlayersDisplay();
            if (p.jailTurns === 0) {
                setTimeout(() => { setMessage(`${p.name} خرج من المحطة!`); updatePlayersDisplay(); }, 900);
            }
            continue;
        }
        if (p.skipNextTurn) {
            p.skipNextTurn = false;
            setMessage(`${p.name} تخطى دوره`);
            continue;
        }
        break;
    } while (attempts < players.length * 5);

    gameSession.consecutiveDoubles = 0;
    updateTurnUI();
}

// ==========================================
// 15. النرد
// ==========================================

function rollDice() {
    const current = players[gameSession.currentPlayer];
    if (!current || !current.human) return;
    if (!gameSession.active) return;
    if (!gameSession.awaitingRoll) return;
    if (gameSession.moving) return;

    if (currentRoom && window.serverGame) {
        const sg = window.serverGame;
        const myIdx = players.findIndex(p => p && p.human);
        if (myIdx === -1) return;
        if (sg.current_turn_idx !== myIdx) {
            setMessage('⚠️ مش دورك');
            return;
        }
        if (!sg.awaiting_roll) {
            setMessage('⚠️ استنى شوية');
            return;
        }

        const rollBtn = document.getElementById("roll-dice-btn");
        if (rollBtn) rollBtn.disabled = true;
        stopTimer();
        socket.emit('game:roll', { room_id: currentRoom.id });
        return;
    }

    const rollBtn = document.getElementById("roll-dice-btn");
    if (rollBtn) rollBtn.disabled = true;
    stopTimer();
    gameSession.awaitingRoll = false;
    performDiceRollLocal(current);
}

// ==========================================
// 16. حركة اللاعب
// ==========================================

function movePlayer(player, steps, isDouble) {
    saveLastRoll(player, player.position, steps);
    let moved = 0;
    let passedStart = false;

    const step = () => {
        if (moved >= steps) {
            if (player.position === 0 && !passedStart) handleExactStartLanding(player, isDouble);
            else handleLanding(player, isDouble);
            return;
        }
        moved++;
        const oldPos = player.position;
        player.position = (player.position + 1) % boardTiles.length;

        if (player.position === 0 && oldPos !== 0 && moved < steps) {
            passedStart = true;
            updateToken(player); updateActiveToken();
            onPlayerPassStart(player);
            transferMoney(null, player.id, 250, null);
            setTimeout(step, 280);
            return;
        }
        updateToken(player); updateActiveToken();
        setTimeout(step, 280);
    };
    step();
}

// ==========================================
// 17. الوقوف على البداية
// ==========================================

function handleExactStartLanding(player, isDouble) {
    handleLandingLocal(player, isDouble);
}
function freeUpgradeProperty(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    tile.level = "building";
    setMessage(`${player.name} طوّر ${tile.name} مجاناً!`);
    updatePlayersDisplay();
    updateTileVisual(index);

    if (player.human) {
        showEventCard("تطوير", "ترقية مجانية!",
            `${player.name} طوّر ${tile.name} مجاناً!\nرسوم المرور: ${Math.floor(tile.rent * 4)}$`,
            "#4dff88",
            () => {
                if (currentRoom && window.serverGame) return;
                if (checkWinConditions()) return;
                finishLandingLocal(player, isDouble);
            });
    } else {
        setTimeout(() => {
            if (currentRoom && window.serverGame) return;
            if (checkWinConditions()) return;
            finishLandingLocal(player, isDouble);
        }, 1200);
    }
}

// ==========================================
// 18. مضاعفة الأرباح
// ==========================================

function applyDoubleRent(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    const oldRent = getRentByLevel(tile);
    tile.rentMultiplier = (tile.rentMultiplier || 1) * 2;
    const newRent = getRentByLevel(tile);

    updateTileVisual(index);
    updatePlayersDisplay();

    if (player.human) {
        showEventCard("🚀", "مضاعفة الأرباح!",
            `${player.name} ضاعف إيجار ${tile.name}\n\nالإيجار: ${oldRent}$ ← ${newRent}$\nالمضاعف: ×${tile.rentMultiplier}`,
            "#BA68C8",
            () => {
                if (currentRoom && window.serverGame) return;
                finishLandingLocal(player, isDouble);
            });
    } else {
        setMessage(`${player.name} ضاعف إيجار ${tile.name} (${oldRent}$ ← ${newRent}$)`);
        setTimeout(() => {
            if (currentRoom && window.serverGame) return;
            finishLandingLocal(player, isDouble);
        }, 1500);
    }
}

// ==========================================
// 19. بطاقة الأحداث
// ==========================================

function showEventCard(icon, title, description, color, onComplete) {
    color = color || "#d6a928";
    const old = document.getElementById("event-card");
    if (old) old.remove();
    if (eventTimerInterval) { clearInterval(eventTimerInterval); eventTimerInterval = null; }

    const card = document.createElement("div");
    card.id = "event-card";
    card.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.3); z-index: 9999998; opacity: 0; transition: all 0.4s cubic-bezier(.34,1.56,.64,1); pointer-events: none;`;

    card.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 3px solid ${color}; border-radius: 22px; padding: 28px 38px 22px; min-width: 300px; max-width: 85vw; text-align: center; box-shadow: 0 0 60px ${color}80, 0 25px 70px rgba(0,0,0,0.95); color: #fff; direction: rtl; font-family: Arial, sans-serif; pointer-events: auto;">
            <div style="font-size: 32px; font-weight: 900; color: ${color}; margin-bottom: 6px;">${icon}</div>
            <div style="font-size: 26px; font-weight: 900; color: ${color}; margin-bottom: 12px;">${title}</div>
            <div style="font-size: 17px; color: #ddd; line-height: 1.6; white-space: pre-line; margin-bottom: 18px;">${description}</div>
            <button type="button" id="event-continue-btn" style="width: 100%; padding: 14px 20px; border: none; border-radius: 12px; font-size: 18px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #ffd84d, #d6a928); color: #0d0919; font-family: inherit; pointer-events: auto;">متابعة</button>
            <div id="event-timer" style="margin-top: 12px; font-size: 14px; color: #888; font-weight: 700;">سيتم المتابعة تلقائياً خلال 10 ثوانٍ</div>
        </div>
    `;
    document.body.appendChild(card);
    setTimeout(() => { card.style.transform = "translate(-50%, -50%) scale(1)"; card.style.opacity = "1"; }, 50);

    let remaining = 10, closed = false;
    const timerEl = document.getElementById("event-timer");

    const close = () => {
        if (closed) return;
        closed = true;
        if (eventTimerInterval) { clearInterval(eventTimerInterval); eventTimerInterval = null; }
        card.style.transform = "translate(-50%, -50%) scale(0.3)";
        card.style.opacity = "0";
        setTimeout(() => { if (card.parentNode) card.remove(); if (onComplete) onComplete(); }, 400);
    };

    eventTimerInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = "سيتم المتابعة تلقائياً خلال " + remaining + " ثانية";
        if (remaining <= 0) close();
    }, 1000);

    const btn = document.getElementById("event-continue-btn");
    if (btn) btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); close(); });
}

// ==========================================
// 20. أنظمة مساعدة
// ==========================================

function getUpgradePrice(tile) { return tile.upgradePrice || Math.floor(tile.price * 1.5); }
function getStealPrice(tile) { return Math.floor(tile.price * 1.5); }

function getRentByLevel(tile) {
    let base;
    if (tile.level === "house")         base = Math.floor(tile.rent * 2);
    else if (tile.level === "building") base = Math.floor(tile.rent * 4);
    else                                base = tile.rent;
    return base * (tile.rentMultiplier || 1);
}

function isOwnedByPlayerOrTeammate(player, tile) {
    if (tile.owner === null || tile.owner === undefined) return false;
    if (tile.owner === player.id) return true;
    if (gameMode === "2v2" && teams) {
        for (const team of teams) {
            if (team.includes(player.id) && team.includes(tile.owner)) return true;
        }
    }
    return false;
}

function isRealOwner(player, tile) { return tile.owner === player.id; }

const balancedLines = {
    "الخط العلوي": ["فالورا", "مونتيرا", "أورفيكا", "سيلفارا", "محطة نوفا"],
    "الخط الأيمن": ["إلورا", "فيرونا", "أستيرا", "كريستال باي", "محطة أوربت"],
    "الخط السفلي": ["بلاكستون", "جولدن ديستريكت", "إمبيريا", "أوريون", "كراون سيتي"],
    "الخط الأيسر": ["سكاي لاين", "رويال أفينيو", "ستارلايت", "ميرافا", "فيلورا", "محطة أسترا"]
};

function getLineTiles(lineName) {
    const names = balancedLines[lineName];
    return boardTiles.filter(t => names.includes(t.name));
}

function checkLineControl(player) {
    for (const lineName in balancedLines) {
        const lineTiles = getLineTiles(lineName);
        if (lineTiles.length === 0) continue;
        if (lineTiles.every(t => t.owner === player.id)) return lineName;
    }
    return null;
}

function checkLineControlTeam(teamIds) {
    for (const lineName in balancedLines) {
        const lineTiles = getLineTiles(lineName);
        if (lineTiles.length === 0) continue;
        if (lineTiles.every(t => teamIds.includes(t.owner))) return lineName;
    }
    return null;
}

function checkWinConditions() {
    if (!gameSession.active) return false;
    const active = getActivePlayers();
    const alivePlayers = active.filter(p => p.alive !== false);

    if (gameMode === "2v2" && teams) {
        for (let i = 0; i < teams.length; i++) {
            const teamIds = teams[i];
            const teamAlive = teamIds.filter(id => players[id].alive !== false);
            if (teamAlive.length === 0) {
                const winnerTeam = teams[1 - i];
                const winnerName = winnerTeam.map(id => players[id].name).join(" + ");
                declareTeamWinner(winnerTeam, `الفريق (${winnerName}) فاز بالمعركة!`);
                return true;
            }
        }
        for (const teamIds of teams) {
            const allAlive = teamIds.every(id => players[id].alive !== false);
            if (!allAlive) continue;
            const lineResult = checkLineControlTeam(teamIds);
            if (lineResult) {
                const teamName = teamIds.map(id => players[id].name).join(" + ");
                declareTeamWinner(teamIds, `الفريق (${teamName}) سيطر على ${lineResult}!`);
                return true;
            }
        }
        return false;
    }

    if (alivePlayers.length === 1) {
        declareWinner(alivePlayers[0], "آخر لاعب صامد!");
        return true;
    }
    for (const p of alivePlayers) {
        const lineResult = checkLineControl(p);
        if (lineResult) {
            declareWinner(p, `سيطر على ${lineResult} بالكامل!`);
            return true;
        }
    }
    return false;
}

function declareWinner(player, reason) {
    gameSession.active = false;
    stopTimer(); updatePlayersDisplay();
    setMessage(`${player.name} فاز باللعبة! (${reason})`);
    setTimeout(() => { alert(`${player.name} فاز باللعبة!\n\n${reason}`); }, 600);
}

function declareTeamWinner(teamIds, reason) {
    gameSession.active = false;
    stopTimer(); updatePlayersDisplay();
    const names = teamIds.map(id => players[id].name).join(" + ");
    setMessage(`الفريق (${names}) فاز! (${reason})`);
    setTimeout(() => { alert(`الفريق (${names}) فاز باللعبة!\n\n${reason}`); }, 600);
}

// ==========================================
// 21. الهبوط على خانة
// ==========================================

function handleLanding(player, isDouble) {
    if (currentRoom && window.serverGame) {
        return;
    }
    handleLandingLocal(player, isDouble);
}

function finishLanding(player, isDouble) {
    if (currentRoom && window.serverGame) {
        return;
    }
    finishLandingLocal(player, isDouble);
}

// ==========================================
// 22. حوارات
// ==========================================

function showUpgradeDialog(player, tile, isDouble) {
    const upgradePrice = getUpgradePrice(tile);
    if (player.money < upgradePrice) {
        setMessage(`${player.name} لا يملك ${upgradePrice}$`);
        finishLanding(player, isDouble); return;
    }
    const oldD = document.getElementById("upgrade-dialog");
    if (oldD) oldD.remove();

    const dialog = document.createElement("div");
    dialog.id = "upgrade-dialog";
    dialog.style.cssText = `position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.85) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; direction: rtl !important; font-family: Arial, sans-serif !important;`;

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 2px solid #4dff88; border-radius: 20px; padding: 25px 30px; min-width: 280px; max-width: 400px; width: 100%; text-align: center; color: #fff;">
            <div style="font-size: 26px; font-weight: 900; color: #4dff88; margin-bottom: 15px;">ترقية المبنى</div>
            <div style="font-size: 20px; font-weight: 900; color: #ffd84d; margin-bottom: 15px;">${tile.name}</div>
            <div style="color: #ccc; font-size: 16px; margin: 8px 0;">التكلفة: <b>${upgradePrice}$</b></div>
            <div style="color: #ccc; font-size: 15px; margin: 8px 0;">رسوم المرور: <b>${Math.floor(tile.rent * 2)}$</b> ← <b style="color:#4dff88;">${Math.floor(tile.rent * 4)}$</b></div>
            <div style="color: #888; font-size: 14px; margin: 8px 0;">رصيدك: <b style="color:#4dff88;">${player.money}$</b></div>
            <div id="upgrade-timer" style="font-size: 30px; font-weight: 900; color: #ff4d4d; margin: 15px 0;">10</div>
            <div style="display: flex; gap: 12px; margin-top: 15px;">
                <button id="upgrade-yes-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4dff88, #1eaa55); color: #0d0919; font-family: inherit;">طوّر</button>
                <button id="upgrade-no-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #666, #333); color: #fff; font-family: inherit;">تخطي</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    let remaining = 10, closed = false, interval;
    const timerEl = document.getElementById("upgrade-timer");

    const finish = (upgrade) => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        dialog.remove();
        if (upgrade) upgradeProperty(player, tile, isDouble);
        else { setMessage(`${player.name} تخطى التطوير`); finishLanding(player, isDouble); }
    };

    document.getElementById("upgrade-yes-btn").onclick = () => finish(true);
    document.getElementById("upgrade-no-btn").onclick = () => finish(false);

    interval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) finish(false);
    }, 1000);
}

function showStealDialog(player, tile, owner, rentPaid, isDouble) {
    const stealPrice = getStealPrice(tile);
    if (player.money < stealPrice) { finishLanding(player, isDouble); return; }

    const oldD = document.getElementById("steal-dialog");
    if (oldD) oldD.remove();

    const dialog = document.createElement("div");
    dialog.id = "steal-dialog";
    dialog.style.cssText = `position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.85) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; direction: rtl !important; font-family: Arial, sans-serif !important;`;

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 2px solid #ffd84d; border-radius: 20px; padding: 25px 30px; min-width: 280px; max-width: 400px; width: 100%; text-align: center; color: #fff;">
            <div style="font-size: 26px; font-weight: 900; color: #ffd84d; margin-bottom: 15px;">عرض شراء</div>
            <div style="font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 10px;">${tile.name}</div>
            <div style="color: #ccc; font-size: 14px; margin: 8px 0;">المالك: <b>${owner.name}</b></div>
            <div style="color: #ff8c00; font-size: 14px; margin: 8px 0;">رسوم مدفوعة: <b>${rentPaid}$</b></div>
            <div style="color: #ccc; font-size: 16px; margin: 12px 0; padding: 10px; background: rgba(255,216,77,0.1); border-radius: 10px;">
                سعر الشراء: <b style="color: #ffd84d; font-size: 20px;">${stealPrice}$</b>
            </div>
            <div style="color: #888; font-size: 14px; margin: 8px 0;">رصيدك: <b style="color:#4dff88;">${player.money}$</b></div>
            <div id="steal-timer" style="font-size: 30px; font-weight: 900; color: #ff4d4d; margin: 15px 0;">10</div>
            <div style="display: flex; gap: 12px; margin-top: 15px;">
                <button id="steal-yes-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #ffd84d, #d6a928); color: #0d0919; font-family: inherit;">اشتري</button>
                <button id="steal-no-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #666, #333); color: #fff; font-family: inherit;">تخطي</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    let remaining = 10, closed = false, interval;
    const timerEl = document.getElementById("steal-timer");

    const finish = (buy) => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        dialog.remove();
        if (buy) { buyFromOwner(player, tile, owner, stealPrice, isDouble); checkWinConditions(); }
        else { setMessage(`${player.name} تخطى الشراء`); finishLanding(player, isDouble); }
    };

    document.getElementById("steal-yes-btn").onclick = () => finish(true);
    document.getElementById("steal-no-btn").onclick = () => finish(false);

    interval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) finish(false);
    }, 1000);
}

function showBuyDialog(player, tile, isDouble) {
    if (player.money < tile.price) {
        setMessage(`${player.name} لا يملك ${tile.price}$`);
        finishLanding(player, isDouble); return;
    }
    const oldDialog = document.getElementById("buy-dialog");
    if (oldDialog) oldDialog.remove();

    const dialog = document.createElement("div");
    dialog.id = "buy-dialog";
    dialog.style.cssText = `position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.85) !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 999999 !important; padding: 20px !important; direction: rtl !important; font-family: Arial, sans-serif !important;`;

    const isStation = tile.type === "station";

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 2px solid #d6a928; border-radius: 20px; padding: 25px 30px; min-width: 260px; max-width: 380px; width: 100%; text-align: center; color: #fff;">
            <div style="font-size: 24px; font-weight: 900; color: #ffd84d; margin-bottom: 15px;">${tile.name}</div>
            <div style="color: #ccc; font-size: 16px; margin: 8px 0;">السعر: <b>${tile.price}$</b></div>
            <div style="color: #ccc; font-size: 16px; margin: 8px 0;">رسوم المرور: <b>${tile.rent}$</b></div>
            <div style="color: #888; font-size: 14px; margin: 8px 0;">رصيدك: <b style="color:#4dff88;">${player.money}$</b></div>
            ${isStation ? '<div style="color: #789bc0; font-size: 13px; margin: 8px 0;">لا يمكن تطويرها</div>' : ''}
            <div id="buy-timer" style="font-size: 34px; font-weight: 900; color: #ff4d4d; margin: 18px 0;">10</div>
            <div style="display: flex; gap: 12px; margin-top: 15px;">
                <button id="buy-yes-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4dff88, #1eaa55); color: #0d0919; font-family: inherit;">اشتري</button>
                <button id="buy-no-btn" style="flex: 1; padding: 14px 20px; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #ff6b6b, #aa1e1e); color: #fff; font-family: inherit;">تخطي</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    let remaining = 10, closed = false;
    const timerEl = document.getElementById("buy-timer");

    const finish = (bought) => {
        if (closed) return;
        closed = true;
        if (buyTimerInterval) { clearInterval(buyTimerInterval); buyTimerInterval = null; }
        dialog.remove();
        if (bought) buyProperty(player, tile, isDouble);
        else { setMessage(`${player.name} تخطى الشراء`); finishLanding(player, isDouble); }
    };

    document.getElementById("buy-yes-btn").onclick = () => finish(true);
    document.getElementById("buy-no-btn").onclick = () => finish(false);

    buyTimerInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) finish(false);
    }, 1000);
}

// ==========================================
// 23. تنفيذ الشراء والتطوير
// ==========================================

function upgradeProperty(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    const upgradePrice = getUpgradePrice(tile);
    transferMoney(player.id, null, upgradePrice, () => {
        tile.level = "building";
        updatePlayersDisplay(); updateTileVisual(index);
        if (player.money <= 0) { handleBankruptcy(player); return; }
        if (checkWinConditions()) return;
        finishLanding(player, isDouble);
    });
}

function upgradePropertyAI(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    const upgradePrice = getUpgradePrice(tile);
    transferMoney(player.id, null, upgradePrice, () => {
        tile.level = "building";
        updatePlayersDisplay(); updateTileVisual(index);
        setMessage(`${player.name} طوّر ${tile.name} بمبلغ ${upgradePrice}$`);
        if (player.money <= 0) { handleBankruptcy(player); return; }
        if (checkWinConditions()) return;
        finishLanding(player, isDouble);
    });
}

function buyFromOwner(player, tile, owner, stealPrice, isDouble) {
    const index = boardTiles.indexOf(tile);
    transferMoney(player.id, owner.id, stealPrice, () => {
        tile.owner = player.id;
        tile.rentMultiplier = 1;
        updatePlayersDisplay(); updateTileVisual(index);
        if (player.money <= 0) { handleBankruptcy(player); return; }
        if (checkWinConditions()) return;
        finishLanding(player, isDouble);
    });
}

function buyProperty(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    const price = tile.price;
    transferMoney(player.id, null, price, () => {
        tile.owner = player.id;
        tile.level = (tile.type === "station") ? null : "house";
        if (tile.type === "property") tile.rentMultiplier = 1;
        updatePlayersDisplay(); updateTileVisual(index);
        if (player.money <= 0) { handleBankruptcy(player); return; }
        if (checkWinConditions()) return;
        finishLanding(player, isDouble);
    });
}

function buyPropertyAI(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    const price = tile.price;
    transferMoney(player.id, null, price, () => {
        tile.owner = player.id;
        tile.level = (tile.type === "station") ? null : "house";
        if (tile.type === "property") tile.rentMultiplier = 1;
        updatePlayersDisplay(); updateTileVisual(index);
        setMessage(`${player.name} اشترى ${tile.name} بمبلغ ${price}$`);
        if (player.money <= 0) { handleBankruptcy(player); return; }
        if (checkWinConditions()) return;
        finishLanding(player, isDouble);
    });
}

// ==========================================
// 24. تحديث شكل الخانة
// ==========================================

function updateTileVisual(index) {
    const tile = boardTiles[index];
    const el = tileElements[index];
    if (!el) return;

    el.className = el.className
        .split(' ')
        .filter(c => !c.startsWith('owned-') && c !== 'team-owned-a' && c !== 'team-owned-b')
        .join(' ');
    el.classList.remove("level-house", "level-building");
    el.classList.remove("team-owned-a", "team-owned-b");
    el.classList.remove("has-city-image");
    el.classList.remove("has-rent-badge");

    const oldImg = el.querySelector(".city-image");
    if (oldImg) oldImg.remove();
    const oldBadge = el.querySelector(".rent-multiplier-badge");
    if (oldBadge) oldBadge.remove();

    if (tile.owner === null || tile.owner === undefined) return;

    const ownerKey = String(tile.owner).replace(/[^0-9a-zA-Z_-]/g, '_');
    el.classList.add("owned-u" + ownerKey);

    if (gameMode === "2v2" && tile.ownerTeamIdx !== null && tile.ownerTeamIdx !== undefined) {
        if (tile.ownerTeamIdx === 0) el.classList.add("team-owned-a");
        else if (tile.ownerTeamIdx === 1) el.classList.add("team-owned-b");
    }
    if (tile.type === "property") {
        if (tile.level === "house") {
            el.classList.add("level-house");
            el.classList.remove("level-building");
            const oldLine = el.querySelector(".owner-line");
            if (oldLine) oldLine.remove();
        }
        if (tile.level === "building") {
            el.classList.add("level-building");
            if (!el.querySelector(".owner-line")) {
                const line = document.createElement("div");
                line.className = "owner-line";
                el.appendChild(line);
            }
        }
    } else {
        const oldLine = el.querySelector(".owner-line");
        if (oldLine) oldLine.remove();
    }
    if (tile.image && tile.type === "property") {
        el.classList.add("has-city-image");
        const img = document.createElement("img");
        img.className = "city-image";
        img.src = tile.image;
        img.alt = tile.name;
        img.draggable = false;
        if (tile.level === "building") img.classList.add("city-image-building");
        else img.classList.add("city-image-house");
        img.onerror = () => { img.remove(); el.classList.remove("has-city-image"); };
        el.appendChild(img);
    }

    if (tile.type === "property" && tile.rentMultiplier && tile.rentMultiplier > 1) {
        const badge = document.createElement("div");
        badge.className = "rent-multiplier-badge";
        badge.textContent = "×" + tile.rentMultiplier;
        el.appendChild(badge);
        el.classList.add("has-rent-badge");
    }
}

// ==========================================
// 25. الإفلاس والمحطة السوداء
// ==========================================

function handleBankruptcy(player) {
    player.money = 0;
    player.alive = false;
    boardTiles.forEach((tile, index) => {
        if (tile.owner === player.id) {
            tile.owner = null;
            tile.level = null;
            if (tile.type === "property") tile.rentMultiplier = 1;
            updateTileVisual(index);
        }
    });
    setMessage(`${player.name} أفلس وخرج من اللعبة!`);
    updatePlayersDisplay();

    setTimeout(() => {
        if (checkWinConditions()) return;
        if (gameSession.active) nextTurn();
    }, 1500);
}

function goToJail(player) {
    if (debugState.noJailFromDoubles) {
        gameSession.consecutiveDoubles = 0;
        gameSession.moving = false;
        finishLanding(player, false);
        return;
    }
    saveLastRoll(player, player.position, 0);
    gameSession.moving = true;
    player.position = 8;
    player.jailTurns = 2;
    updateToken(player);
    updateActiveToken();
    setMessage(`${player.name} دخل المحطة السوداء`);
    gameSession.consecutiveDoubles = 0;
    updatePlayersDisplay();

    setTimeout(() => {
        gameSession.moving = false;
        if (currentRoom && window.serverGame) return;
        nextTurn();
    }, 1200);
}

// ==========================================
// 26. الرسائل والتايمر
// ==========================================

function setMessage(text) {
    const el = document.getElementById("game-message");
    if (el) el.textContent = text;
}

function startTimer(seconds, onEnd) {
    if (debugState.noTimer) return;
    stopTimer();
    let remaining = seconds;
    const el = document.getElementById("dice-timer");

    const update = () => {
        if (!el) return;
        el.textContent = "الوقت: " + remaining;
        el.classList.toggle("decision-timer-danger", remaining <= 3);
    };
    update();

    timerInterval = setInterval(() => {
        remaining--;
        update();
        if (remaining <= 0) { stopTimer(); if (onEnd) onEnd(); }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    const el = document.getElementById("dice-timer");
    if (el) { el.textContent = ""; el.classList.remove("decision-timer-danger"); }
}

// ==========================================
// 27. ضربة الحظ
// ==========================================

function executeChanceCard(player, isDouble) {
    let card = chanceCards[Math.floor(Math.random() * chanceCards.length)];

    const isKiro = player.human && playerData.selectedCharacter === "kiro";
    if (isKiro && !player._usedPlanThisTurn) {
        const roll = Math.floor(Math.random() * 100) + 1;
        if (roll <= 35) {
            showPlanChoiceDialog(player, card, isDouble);
            return;
        }
    }

    if (chanceSystem.reverseNextCard) {
        chanceSystem.reverseNextCard = false;
        card = reverseCard(card);
        setMessage("🙃 كل شيء بالمقلوب: التأثير انعكس!");
    }

    showChanceCardModal(card, () => {
        executeCardEffect(player, card, isDouble, () => {
            finishLanding(player, isDouble);
        });
    }, player.name);
}

function showPlanChoiceDialog(player, originalCard, isDouble) {
    const old = document.getElementById("plan-choice-dialog");
    if (old) old.remove();

    const dialog = document.createElement("div");
    dialog.id = "plan-choice-dialog";
    dialog.style.cssText = `
        position: fixed; inset: 0; z-index: 9999999;
        background: rgba(0,0,0,0.9);
        display: flex; align-items: center; justify-content: center;
        padding: 20px; direction: rtl;
        font-family: Arial, sans-serif;
    `;

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 3px solid #4a9fe8; border-radius: 22px; padding: 26px 30px; min-width: 300px; max-width: 440px; width: 100%; text-align: center; color: #fff; box-shadow: 0 0 60px rgba(74,159,232,0.6), 0 25px 70px rgba(0,0,0,0.95);">
            <div style="font-size: 24px; font-weight: 900; color: #4a9fe8; margin-bottom: 6px;">📋 لدي خطة</div>
            <div style="font-size: 14px; color: #b9adca; margin-bottom: 18px;">هل تريد استخدام المهارة؟</div>
            <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">البطاقة المسحوبة:</div>
            <div style="padding: 16px 18px; background: rgba(255,216,77,0.1); border: 2px dashed rgba(255,216,77,0.5); border-radius: 14px; font-size: 16px; font-weight: 700; color: #ffd84d; line-height: 1.5; margin-bottom: 18px;">
                "${originalCard.text}"
            </div>
            <div style="font-size: 13px; color: #888; margin-bottom: 20px; line-height: 1.5;">
                🔄 تجاهل هذه البطاقة وسحب أخرى<br>
                ⚠️ متاح مرة واحدة فقط في كل دور
            </div>
            <div style="display: flex; gap: 12px;">
                <button id="plan-accept-btn" type="button" style="flex: 1; padding: 14px 16px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4dff88, #1eaa55); color: #0d0919; font-family: inherit;">✅ قبول البطاقة</button>
                <button id="plan-redraw-btn" type="button" style="flex: 1; padding: 14px 16px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4a9fe8, #2a6fb8); color: #fff; font-family: inherit;">🔄 تجاهل واسحب أخرى</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const acceptBtn = dialog.querySelector("#plan-accept-btn");
    const redrawBtn = dialog.querySelector("#plan-redraw-btn");

    acceptBtn.onclick = () => {
        dialog.remove();
        showChanceCardModal(originalCard, () => {
            executeCardEffect(player, originalCard, isDouble, () => {
                finishLanding(player, isDouble);
            });
        }, player.name);
    };

    redrawBtn.onclick = () => {
        dialog.remove();
        player._usedPlanThisTurn = true;
        showPassiveActivation(player.id, "📋", "لدي خطة");
        setMessage("📋 لدي خطة: تم تجاهل البطاقة وسحب أخرى");

        const newCard = chanceCards[Math.floor(Math.random() * chanceCards.length)];
        setTimeout(() => {
            showChanceCardModal(newCard, () => {
                executeCardEffect(player, newCard, isDouble, () => {
                    finishLanding(player, isDouble);
                });
            }, player.name);
        }, 900);
    };
}
function executeCardEffect(player, card, isDouble, onComplete) {
    const done = onComplete || (() => finishLanding(player, isDouble));

    if (card.effect === "move_forward") {
        movePlayerSteps(player, card.steps, isDouble, done);
        return;
    }
    
    if (card.effect === "move_backward") {
        movePlayerSteps(player, -card.steps, isDouble, done);
        return;
    }

    if (card.effect === "back_to_start") {
        transferMoney(null, player.id, 250, () => {
            saveLastRoll(player, player.position, 0);
            player.position = 0;
            updateToken(player); updateActiveToken(); updatePlayersDisplay();
            setMessage(`${player.name} عاد للبداية واستلم 250$`);
            setTimeout(done, 600);
        });
        return;
    }

    if (card.effect === "go_jail") {
        goToJail(player);
        setTimeout(done, 1500);
        return;
    }

    if (card.effect === "go_airport") {
        saveLastRoll(player, player.position, 0);
        player.position = 16;
        updateToken(player); updateActiveToken(); updatePlayersDisplay();
        setMessage(`${player.name} انتقل لبوابة العالم`);
        setTimeout(() => {
            handleLanding(player, isDouble);
        }, 700);
        return;
    }

    if (card.effect === "teleport_to_player") {
        const others = getActivePlayers().filter(p => p.id !== player.id && p.alive !== false);
        if (others.length === 0) { done(); return; }
        const target = others[Math.floor(Math.random() * others.length)];
        
        playSwapEffect(player, target);
        
        setTimeout(() => {
            saveLastRoll(player, player.position, 0);
            player.position = target.position;
            updateToken(player); updateActiveToken(); updatePlayersDisplay();
            handleLanding(player, isDouble);
        }, 900);
        return;
    }

    if (card.effect === "teleport_to_building") {
        const props = boardTiles.map((t, i) => ({ t, i })).filter(o => 
            o.t.type === "property" && o.t.level !== null && o.t.owner !== null && o.t.owner !== undefined
        );
        if (props.length === 0) { done(); return; }
        const pick = props[Math.floor(Math.random() * props.length)];
        saveLastRoll(player, player.position, 0);
        player.position = pick.i;
        updateToken(player); updateActiveToken(); updatePlayersDisplay();
        setMessage(`${player.name} زار ${pick.t.name}`);
        setTimeout(() => handleLanding(player, isDouble), 700);
        return;
    }

    if (card.effect === "random_tp") {
        const pos = Math.floor(Math.random() * boardTiles.length);
        saveLastRoll(player, player.position, 0);
        player.position = pos;
        updateToken(player); updateActiveToken(); updatePlayersDisplay();
        setMessage(`${player.name} انتقل عشوائياً إلى ${boardTiles[pos].name}`);
        setTimeout(() => handleLanding(player, isDouble), 700);
        return;
    }

    if (card.effect === "swap_places") {
        const others = getActivePlayers().filter(p => p.id !== player.id && p.alive !== false);
        if (others.length === 0) { done(); return; }
        const target = others[Math.floor(Math.random() * others.length)];
        
        playSwapEffect(player, target);
        
        saveLastRoll(player, player.position, 0);
        saveLastRoll(target, target.position, 0);
        const temp = player.position;
        player.position = target.position;
        target.position = temp;
        
        setTimeout(() => {
            updateToken(player); updateToken(target);
            updateActiveToken(); updatePlayersDisplay();
        }, 700);
        
        setMessage(`🔀 ${player.name} بدل مع ${target.name}`);
        setTimeout(done, 1800);
        return;
    }

    if (card.effect === "swap_property") {
        const myProps = getOwnedSelectableProperties(player, 1, 2);
        const otherProps = getOtherPlayersProperties(player).filter(t => {
            const lvl = t.level === "house" ? 1 : (t.level === "building" ? 2 : 0);
            return lvl >= 1 && lvl <= 2;
        });
        if (myProps.length === 0 || otherProps.length === 0) {
            showInfoCard("😕", "لا يمكن التبديل", "لا يوجد عقارات مناسبة للتبديل", "#888");
            setTimeout(done, 1000);
            return;
        }
        const mine = myProps[Math.floor(Math.random() * myProps.length)];
        const theirs = otherProps[Math.floor(Math.random() * otherProps.length)];
        const myIdx = boardTiles.indexOf(mine);
        const theirIdx = boardTiles.indexOf(theirs);
        const oldOwner = theirs.owner;
        
        mine.owner = oldOwner;
        theirs.owner = player.id;
        
        updateTileVisual(myIdx); updateTileVisual(theirIdx);
        updatePlayersDisplay();
        setMessage(`🏛️ تم تبديل ${mine.name} بـ ${theirs.name}`);
        setTimeout(done, 1200);
        return;
    }

    if (card.effect === "half_their_wealth") {
        const others = getActivePlayers().filter(p => p.id !== player.id && p.alive !== false);
        if (others.length === 0) { done(); return; }
        let completed = 0;
        others.forEach(other => {
            const half = Math.floor(other.money * 0.5);
            if (half > 0) {
                transferMoney(other.id, player.id, half, () => {
                    completed++;
                    if (completed === others.length) done();
                });
            } else {
                completed++;
                if (completed === others.length) done();
            }
        });
        return;
    }

    if (card.effect === "half_your_wealth") {
        const others = getActivePlayers().filter(p => p.id !== player.id && p.alive !== false);
        if (others.length === 0) { done(); return; }
        const myHalf = Math.floor(player.money * 0.5);
        if (myHalf <= 0) { done(); return; }
        const share = Math.floor(myHalf / others.length);
        if (share <= 0) { done(); return; }
        let completed = 0;
        others.forEach(other => {
            transferMoney(player.id, other.id, share, () => {
                completed++;
                if (completed === others.length) {
                    if (player.money <= 0) handleBankruptcy(player);
                    done();
                }
            });
        });
        return;
    }

    if (card.effect === "share_luck") {
        const c1 = chanceCards[Math.floor(Math.random() * chanceCards.length)];
        const c2 = chanceCards[Math.floor(Math.random() * chanceCards.length)];
        
        if (player.human) {
            showTwoCardsChoice(player, c1, c2, (chosen, other) => {
                const others = getActivePlayers().filter(p => p.id !== player.id && p.alive !== false);
                const target = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : null;
                
                showChanceCardModal(chosen, () => {
                    executeCardEffect(player, chosen, isDouble, () => {
                        if (target) {
                            setMessage(`🎴 ${target.name} استلم البطاقة الثانية (قسراً): ${other.name}`);
                            showChanceCardModal(other, () => {
                                executeCardEffect(target, other, false, done);
                            }, target.name);
                        } else {
                            done();
                        }
                    });
                }, player.name);
            });
        } else {
            const chosenIdx = Math.random() < 0.5 ? 0 : 1;
            const chosen = chosenIdx === 0 ? c1 : c2;
            const other = chosenIdx === 0 ? c2 : c1;
            
            const others = getActivePlayers().filter(p => p.id !== player.id && p.alive !== false);
            const target = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : null;
            
            setMessage(`${player.name} سحب بطاقتين واختار واحدة...`);
            
            showChanceCardModal(chosen, () => {
                executeCardEffect(player, chosen, isDouble, () => {
                    if (target) {
                        setMessage(`🎴 ${target.name} استلم البطاقة الثانية (قسراً): ${other.name}`);
                        showChanceCardModal(other, () => {
                            executeCardEffect(target, other, false, done);
                        }, target.name);
                    } else {
                        done();
                    }
                });
            }, player.name);
        }
        return;
    }

    if (card.effect === "dice_double") {
        player._diceDoubleNextTurn = true;
        setMessage("🎲 قوة النرد: الدور القادم ×2");
        setTimeout(done, 900);
        return;
    }

    if (card.effect === "triple_rent") {
        const myProps = getOwnedSelectableProperties(player, 1, 2);
        if (myProps.length === 0) {
            showInfoCard("😕", "لا يوجد عقارات", "لا تملك عقارات لتطبيق ×3", "#888");
            setTimeout(done, 1000);
            return;
        }
        startPropertyMultiplierSelection(player, 3, () => done());
        return;
    }

    if (card.effect === "annoying_neighbor") {
        const neighbor = findNearestPlayerToTile(player, true);
        if (!neighbor) { done(); return; }
        neighbor._annoyingNeighborCard = {
            owner: player.id,
            lapsRequired: 2,
            startLaps: neighbor._startLaps || 0
        };
        player._annoyingNeighborCard = {
            target: neighbor.id
        };
        setMessage(`🏠 ${neighbor.name} لن يشتري أو يطوّر حتى يمر بالبداية مرتين`);
        setTimeout(done, 1200);
        return;
    }

    if (card.effect === "hot_seat") {
        const target = findPlayerClosestToStart();
        if (!target || target.id === player.id) {
            setMessage("🪑 أنت بالفعل الأقرب للبداية");
            setTimeout(done, 800);
            return;
        }
        
        playSwapEffect(player, target);
        
        saveLastRoll(player, player.position, 0);
        saveLastRoll(target, target.position, 0);
        const temp = player.position;
        player.position = target.position;
        target.position = temp;
        
        setTimeout(() => {
            updateToken(player); updateToken(target);
            updateActiveToken(); updatePlayersDisplay();
        }, 700);
        
        setMessage(`🪑 ${player.name} بدل مكانه مع ${target.name}`);
        setTimeout(done, 1800);
        return;
    }

    if (card.effect === "poisoned_gift") {
        const others = getActivePlayers().filter(p => p.id !== player.id && p.alive !== false);
        if (others.length === 0) { done(); return; }
        let completed = 0;
        others.forEach(other => {
            const pay = Math.min(100, player.money);
            if (pay > 0) {
                transferMoney(player.id, other.id, pay, () => {
                    completed++;
                    if (completed === others.length) {
                        player._poisonedGift = {
                            lapsToExpire: 2,
                            startLaps: player._startLaps || 0
                        };
                        if (player.money <= 0) handleBankruptcy(player);
                        done();
                    }
                });
            } else {
                completed++;
                if (completed === others.length) done();
            }
        });
        return;
    }

    if (card.effect === "double_draw") {
        const c1 = chanceCards[Math.floor(Math.random() * chanceCards.length)];
        const c2 = chanceCards[Math.floor(Math.random() * chanceCards.length)];
        showChanceCardModal(c1, () => {
            executeCardEffect(player, c1, isDouble, () => {
                setTimeout(() => {
                    showChanceCardModal(c2, () => {
                        executeCardEffect(player, c2, isDouble, done);
                    }, player.name);
                }, 400);
            });
        }, player.name);
        return;
    }

    if (card.effect === "reverse_card") {
        chanceSystem.reverseNextCard = true;
        setMessage("🙃 البطاقة القادمة ستكون معكوسة!");
        const newCard = chanceCards[Math.floor(Math.random() * chanceCards.length)];
        const reversed = reverseCard(newCard);
        showChanceCardModal(reversed, () => {
            executeCardEffect(player, reversed, isDouble, done);
        }, player.name);
        return;
    }

    if (card.effect === "suspicious_gift") {
        transferMoney(null, player.id, 500, () => {
            player._suspiciousGift = {
                active: true,
                lapsToExpire: 2,
                startLaps: player._startLaps || 0
            };
            setMessage("💰 أخذت 500$ — لو خسرت أي مبلغ، هتدفع 700$");
            setTimeout(done, 1200);
        });
        return;
    }

    if (card.effect === "time_running_out") {
        player._timeRunningOut = {
            lapsRemaining: 3,
            startLaps: player._startLaps || 0,
            success: false
        };
        setMessage("⏳ لديك 3 مرات مرور بالبداية للوصول لبوابة العالم");
        setTimeout(done, 1200);
        return;
    }

    if (card.effect === "fortune_swap") {
        const { richest, poorest } = findRichestAndPoorest();
        if (!richest || !poorest || richest.id === poorest.id) { done(); return; }
        
        const rAmount = Math.floor(richest.money * 0.3);
        const pAmount = Math.floor(poorest.money * 0.3);
        
        let finished = 0;
        const finishOnce = () => {
            finished++;
            if (finished < 2) return;
            
            richest.money -= rAmount;
            richest.money += pAmount;
            poorest.money -= pAmount;
            poorest.money += rAmount;
            
            showFloatingMoney(richest.id, pAmount - rAmount);
            showFloatingMoney(poorest.id, rAmount - pAmount);
            updatePlayersDisplay();
            setMessage(`🔄 ${richest.name} و ${poorest.name} تبادلا 30% من أموالهما`);
            done();
        };
        
        animateMoneyTransferDirect(richest.id, poorest.id, rAmount, finishOnce);
        animateMoneyTransferDirect(poorest.id, richest.id, pAmount, finishOnce);
        return;
    }

    if (card.effect === "wrong_move") {
        const sequence = [-4, 2, -2, 4];
        let stepIdx = 0;
        
        const nextStep = () => {
            if (stepIdx >= sequence.length) {
                showInfoCard("🤔", "لماذا كل هذه الحركة؟", "لا بطاقات إضافية لك", "#888");
                setTimeout(done, 1000);
                return;
            }
            const s = sequence[stepIdx];
            stepIdx++;
            movePlayerSteps(player, s, false, nextStep, true);
        };
        nextStep();
        return;
    }

    if (card.effect === "double_rent_all") {
        const props = boardTiles.filter(t => t.type === "property" && t.owner === player.id);
        props.forEach(p => { p.rentMultiplier = (p.rentMultiplier || 1) * 2; });
        props.forEach(p => {
            const i = boardTiles.indexOf(p);
            updateTileVisual(i);
        });
        setMessage(`💵 تم مضاعفة إيجار ${props.length} عقار`);
        setTimeout(done, 1200);
        return;
    }

    if (card.effect === "earthquake") {
        const otherProps = getOtherPlayersProperties(player);
        if (otherProps.length === 0) {
            showInfoCard("😕", "لا يوجد عقارات", "لا يوجد عقارات لشخص آخر", "#888");
            setTimeout(done, 1000);
            return;
        }
        const pick = otherProps[Math.floor(Math.random() * otherProps.length)];
        const idx = boardTiles.indexOf(pick);
        destroyEnemyProperty(player, idx);
        setMessage(`💥 تم تدمير ${pick.name}!`);
        setTimeout(done, 1200);
        return;
    }

    if (card.effect === "luck_wave") {
        const allPlayers = getActivePlayers().filter(p => p.alive !== false);
        if (allPlayers.length === 0) { done(); return; }
        
        const CARDS_PER_PLAYER = 1;
        
        const queues = allPlayers.map(p => ({
            player: p,
            cards: Array.from({ length: CARDS_PER_PLAYER }, () => 
                chanceCards[Math.floor(Math.random() * chanceCards.length)]
            )
        }));
        
        let queueIdx = 0;
        let cardIdx = 0;
        
        const nextCard = () => {
            if (queueIdx >= queues.length) {
                setMessage("🌊 موجة الحظ انتهت!");
                setTimeout(done, 800);
                return;
            }
            
            const q = queues[queueIdx];
            const c = q.cards[cardIdx];
            
            setMessage(`🌊 ${q.player.name} — بطاقة ${cardIdx + 1} من ${CARDS_PER_PLAYER}`);
            
            showChanceCardModal(c, () => {
                executeCardEffect(q.player, c, false, () => {
                    cardIdx++;
                    if (cardIdx >= CARDS_PER_PLAYER) {
                        cardIdx = 0;
                        queueIdx++;
                    }
                    setTimeout(nextCard, 300);
                });
            }, q.player.name);
        };
        
        nextCard();
        return;
    }

    if (card.effect === "rewind_time") {
        const backPos = player._lastRollFrom !== undefined ? player._lastRollFrom : 0;
        player.position = backPos;
        updateToken(player); updateActiveToken(); updatePlayersDisplay();
        setMessage(`⏰ ${player.name} عاد للخانة ${backPos}`);
        setTimeout(() => {
            gameSession.moving = false;
            if (player.position === 0) handleExactStartLanding(player, isDouble);
            else handleLanding(player, isDouble);
        }, 900);
        return;
    }

    if (card.effect === "smart_tenant") {
        const props = boardTiles.filter(t => t.owner === player.id && t.type === "property");
        let total = 0;
        props.forEach(p => { total += getRentByLevel(p); });
        if (total > 0) {
            transferMoney(null, player.id, total, () => {
                setMessage(`🏦 استلمت ${total}$ من خزينة اللعبة`);
                done();
            });
        } else {
            setMessage("🏦 لا تملك عقارات");
            setTimeout(done, 800);
        }
        return;
    }

    if (card.effect === "rent_curse") {
        const highest = findHighestRentProperty(player);
        if (!highest) {
            showInfoCard("😕", "لا يوجد عقارات", "لا تملك عقارات لتطبيق اللعنة", "#888");
            setTimeout(done, 1000);
            return;
        }
        const idx = boardTiles.indexOf(highest);
        highest._cursed = true;
        highest._curseOwner = player.id;
        
        player._rentCurse = {
            tileIndex: idx,
            remainingLaps: 2
        };
        
        const el = tileElements[idx];
        if (el) el.style.filter = "grayscale(1) brightness(0.6)";
        
        setMessage(`🌫️ ${highest.name} ملعونة — ستنتهي بعد مرورين بالبداية`);
        setTimeout(done, 1400);
        return;
    }

    if (card.effect === "lifetime_deal") {
        transferMoney(player.id, null, 200, () => {
            const freeProps = boardTiles.filter(t => t.type === "property" && t.owner === null);
            if (freeProps.length === 0) {
                setMessage("💼 لا يوجد عقارات شاغرة");
                setTimeout(done, 800);
                return;
            }
            const pick = freeProps[Math.floor(Math.random() * freeProps.length)];
            pick.owner = player.id;
            pick.level = "building";
            pick.rentMultiplier = 1;
            const idx = boardTiles.indexOf(pick);
            updateTileVisual(idx); updatePlayersDisplay();
            setMessage(`💼 اشتريت ${pick.name} (لفل 2)!`);
            setTimeout(done, 1200);
        });
        return;
    }

    if (card.effect === "life_saver") {
        player._lifeSaverCard = true;
        setMessage("🛟 طوق النجاة محفوظ — لو مالك أقل من 200$");
        setTimeout(done, 1000);
        return;
    }

    if (card.effect === "guaranteed_gain") {
        player._guaranteedGain = true;
        setMessage("🎯 أول لاعب يمر بالبداية سيدفع لك 250$");
        setTimeout(done, 1000);
        return;
    }

    if (card.effect === "time_bomb") {
        player._timeBombTurns = 3;
        setMessage("💣 القنبلة الموقوتة — 3 أدوار ثم تخسر 400$");
        setTimeout(done, 1200);
        return;
    }

    if (card.effect === "treasury_debt") {
        player._treasuryDebt = 500;
        setMessage("📜 عليك دين 500$ — هيتم خصمه عند مرورك بالبداية");
        setTimeout(done, 1000);
        return;
    }

    if (card.effect === "treasury_debt_instant") {
        const props = boardTiles.filter(t => t.owner === player.id && t.type === "property");
        let total = 0;
        props.forEach(p => { total += getRentByLevel(p); });
        if (total > 0) {
            transferMoney(player.id, null, total, () => {
                if (player.money <= 0) handleBankruptcy(player);
                done();
            });
        } else {
            done();
        }
        return;
    }

    console.warn("⚠️ بطاقة غير معروفة:", card.effect);
    done();
}

// ==========================================
// 🎴 عرض بطاقتين للاختيار
// ==========================================

function showTwoCardsChoice(player, card1, card2, onChoice) {
    const old = document.getElementById("two-cards-modal");
    if (old) old.remove();

    const modal = document.createElement("div");
    modal.id = "two-cards-modal";
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 9999999;
        background: rgba(0,0,0,0.92);
        display: flex; align-items: center; justify-content: center;
        padding: 20px; direction: rtl; font-family: Arial, sans-serif;
        animation: chanceCardFadeIn 0.3s ease;
        flex-wrap: wrap; gap: 16px;
    `;

    modal.innerHTML = `
        <div style="text-align: center; width: 100%; color: #ffd84d; font-size: 22px; font-weight: 900; margin-bottom: 10px;">
            🎴 اختر بطاقة
        </div>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; width: 100%;" id="two-cards-container"></div>
    `;

    document.body.appendChild(modal);
    const container = document.getElementById("two-cards-container");

    const buildCard = (c, other) => {
        const typeColors = {
            reward: "#4dff88", loss: "#ff4d4d", move: "#ffd84d",
            strategic: "#BA68C8", interactive: "#4a9fe8", info: "#888"
        };
        const color = typeColors[c.type] || "#E8B947";
        
        const div = document.createElement("div");
        div.style.cssText = `
            width: min(280px, 42vw); min-width: 200px;
            background: linear-gradient(180deg, #2a1540 0%, #150820 100%);
            border: 3px solid ${color};
            border-radius: 18px; padding: 18px 14px;
            cursor: pointer; text-align: center; color: #fff;
            box-shadow: 0 0 30px ${color}80, 0 15px 40px rgba(0,0,0,0.8);
            transition: transform 0.2s;
        `;
        div.innerHTML = `
            <div style="font-size: 55px; margin-bottom: 10px;">${c.icon}</div>
            <div style="font-size: 18px; font-weight: 900; color: ${color}; margin-bottom: 8px;">${c.name}</div>
            <div style="font-size: 13px; color: #ccc; line-height: 1.5;">${c.text}</div>
        `;
        div.onmouseenter = () => div.style.transform = "scale(1.05)";
        div.onmouseleave = () => div.style.transform = "scale(1)";
        div.onclick = () => {
            modal.remove();
            onChoice(c, other);
        };
        return div;
    };

    container.appendChild(buildCard(card1, card2));
    container.appendChild(buildCard(card2, card1));
}

// ==========================================
// 💎 اختيار عقار لمضاعفة الإيجار
// ==========================================

function startPropertyMultiplierSelection(player, multiplier, onComplete) {
    const myProps = getOwnedSelectableProperties(player, 1, 2);
    if (myProps.length === 0) {
        if (onComplete) onComplete();
        return;
    }

    let overlay = document.getElementById("property-multiplier-overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "property-multiplier-overlay";
    overlay.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        z-index: 500; background: linear-gradient(145deg, #2a1330, #1a0919);
        border: 3px solid #ffd84d; border-radius: 18px; padding: 15px 25px;
        text-align: center; color: #fff; font-family: Arial, sans-serif;
        box-shadow: 0 0 40px rgba(255, 216, 77, 0.7);
        max-width: 90vw; direction: rtl;
    `;
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: 900; color: #ffd84d; margin-bottom: 6px;">💎 اختر عقار</div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">سيتم مضاعفة إيجار العقار ×${multiplier} — اختر الآن!</div>
        <div id="property-multiplier-timer" style="font-size: 26px; font-weight: 900; color: #ff4d4d;">10</div>
    `;
    document.body.appendChild(overlay);

    let picked = false;

    const clearAll = () => {
        const o = document.getElementById("property-multiplier-overlay");
        if (o) o.remove();
        if (autoTimer) clearInterval(autoTimer);
        tileElements.forEach(el => {
            el.classList.remove("double-rent-selectable");
            el.onclick = null;
            el.ontouchstart = null;
        });
    };

    tileElements.forEach((el, index) => {
        const t = boardTiles[index];
        if (t.type === "property" && t.owner === player.id) {
            el.classList.add("double-rent-selectable");
            const handler = (e) => {
                if (picked) return;
                picked = true;
                e.preventDefault(); e.stopPropagation();
                clearAll();
                t.rentMultiplier = (t.rentMultiplier || 1) * multiplier;
                updateTileVisual(index);
                setMessage(`💎 تم مضاعفة إيجار ${t.name} ×${multiplier}`);
                setTimeout(() => { if (onComplete) onComplete(); }, 800);
            };
            el.onclick = handler;
            el.ontouchstart = handler;
        }
    });

    let remaining = 10;
    const timerEl = document.getElementById("property-multiplier-timer");
    const autoTimer = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0 && !picked) {
            picked = true;
            clearAll();
            const best = myProps.reduce((a, b) => 
                getRentByLevel(a) > getRentByLevel(b) ? a : b
            );
            const idx = boardTiles.indexOf(best);
            best.rentMultiplier = (best.rentMultiplier || 1) * multiplier;
            updateTileVisual(idx);
            setMessage(`💎 (تلقائي) تم مضاعفة إيجار ${best.name} ×${multiplier}`);
            setTimeout(() => { if (onComplete) onComplete(); }, 800);
        }
    }, 1000);
}

// ==========================================
// 🎴 نظام بطاقات الحظ
// ==========================================

const chanceSystem = {
    doubleNextCard: false,
    reverseNextCard: false,
    lastDiceRoll: null
};

function showChanceCardModal(card, onComplete, playerName) {
    const old = document.getElementById("chance-card-modal");
    if (old) old.remove();
    if (eventTimerInterval) { clearInterval(eventTimerInterval); eventTimerInterval = null; }

    const typeLabels = {
        reward:      "✨ مكافأة",
        loss:        "⚠️ خسارة",
        move:        "🚶 حركة",
        strategic:   "📌 تبقى معك",
        interactive: "🔀 تفاعلي",
        info:        "ℹ️ معلومة"
    };

    const typeIcons = {
        reward:      "🎁",
        loss:        "💀",
        move:        "➡️",
        strategic:   "📌",
        interactive: "👥",
        info:        "ℹ️"
    };

    const modal = document.createElement("div");
    modal.id = "chance-card-modal";
    modal.className = "chance-card-modal";

    const displayName = playerName || "";

    modal.innerHTML = `
        <div class="chance-card-wrapper">
            <div class="chance-card-player-header">
                <div class="hdr-icon">🎲</div>
                <div class="hdr-text">حظ</div>
                ${displayName ? `
                    <div class="hdr-sep"></div>
                    <div class="hdr-name">${displayName}</div>
                ` : ''}
            </div>
            <div class="chance-card type-${card.type || 'move'}">
                <div class="chance-card-badge">${typeLabels[card.type] || "🎴 بطاقة"}</div>
                <div class="chance-card-type-icon">${typeIcons[card.type] || "🎴"}</div>
                
                <div class="chance-card-image-area">
                    ${card.image 
                        ? `<img src="${card.image}" class="card-img" alt="${card.name}" onerror="this.parentElement.innerHTML='<div class=\\'card-emoji\\'>${card.icon}</div>'">`
                        : `<div class="card-emoji">${card.icon}</div>`}
                </div>
                
                <div class="chance-card-name">${card.name}</div>
                <div class="chance-card-divider"></div>
                <div class="chance-card-text">${card.text}</div>
                
                <button class="chance-card-btn" type="button" id="chance-card-continue">متابعة</button>
                <div class="chance-card-timer" id="chance-card-timer">متابعة تلقائية خلال 10 ثواني</div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    let remaining = 10, closed = false;
    const timerEl = document.getElementById("chance-card-timer");

    const close = () => {
        if (closed) return;
        closed = true;
        if (eventTimerInterval) { clearInterval(eventTimerInterval); eventTimerInterval = null; }
        modal.style.opacity = "0";
        modal.style.transition = "opacity 0.35s";
        setTimeout(() => {
            if (modal.parentNode) modal.remove();
            if (onComplete) onComplete();
        }, 350);
    };

    document.getElementById("chance-card-continue").onclick = close;

    eventTimerInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `متابعة تلقائية خلال ${remaining} ثواني`;
        if (remaining <= 0) close();
    }, 1000);
}

function reverseCard(card) {
    const r = { ...card };
    r.name = "معكوس: " + card.name;
    
    switch(card.effect) {
        case "move_forward":
            r.effect = "move_backward";
            r.steps = card.steps;
            r.text = `تراجع ${card.steps} خانة`;
            r.icon = "⬅️";
            break;
        case "half_their_wealth":
            r.effect = "half_your_wealth";
            r.text = "وزع 50% من ثروتك على اللاعبين";
            r.type = "loss";
            r.icon = "💸";
            break;
        case "half_your_wealth":
            r.effect = "half_their_wealth";
            r.text = "كل لاعب يدفعلك 50% من ثروته";
            r.type = "reward";
            r.icon = "💰";
            break;
        case "smart_tenant":
            r.effect = "treasury_debt_instant";
            r.text = "ادفع مجموع كل إيجار لديك حالياً";
            r.type = "loss";
            r.icon = "💸";
            break;
        case "back_to_start":
            break;
        default:
            return card;
    }
    return r;
}

function showInfoCard(icon, title, text, color) {
    color = color || "#888";
    const old = document.getElementById("info-card-modal");
    if (old) old.remove();

    const modal = document.createElement("div");
    modal.id = "info-card-modal";
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 9999999;
        background: rgba(0,0,0,0.9);
        display: flex; align-items: center; justify-content: center;
        padding: 20px; direction: rtl; font-family: Arial, sans-serif;
        animation: chanceCardFadeIn 0.3s ease;
    `;

    modal.innerHTML = `
        <div style="
            background: linear-gradient(180deg, #2a1540 0%, #150820 100%);
            border: 4px solid ${color};
            border-radius: 24px;
            padding: 30px 26px;
            max-width: 400px; width: 100%;
            text-align: center; color: #fff;
            box-shadow: 0 0 60px ${color}80, 0 25px 80px rgba(0,0,0,0.9);
            animation: chanceCardPop 0.55s cubic-bezier(.34,1.56,.64,1);
        ">
            <div style="font-size: 70px; margin-bottom: 14px; filter: drop-shadow(0 0 20px ${color});">${icon}</div>
            <div style="font-size: 24px; font-weight: 900; color: ${color}; margin-bottom: 14px; text-shadow: 0 0 20px ${color}80;">${title}</div>
            <div style="font-size: 16px; color: #ddd; line-height: 1.7; margin-bottom: 22px; white-space: pre-line;">${text}</div>
            <button type="button" id="info-card-close-btn" style="
                width: 100%; padding: 14px; border: none; border-radius: 12px;
                font-size: 16px; font-weight: 900; cursor: pointer;
                font-family: inherit;
                background: linear-gradient(135deg, ${color}, #444);
                color: #0d0919;
                box-shadow: 0 4px 0 rgba(0,0,0,0.4);
            ">متابعة</button>
        </div>
    `;

    document.body.appendChild(modal);
    
    const close = () => {
        modal.style.opacity = "0";
        modal.style.transition = "opacity 0.3s";
        setTimeout(() => modal.remove(), 300);
    };
    document.getElementById("info-card-close-btn").onclick = close;
    
    setTimeout(() => { if (modal.parentNode) close(); }, 8000);
}

// ==========================================
// 🎯 دوال مساعدة
// ==========================================

function findNearestPlayerToTile(fromPlayer, excludeSelf) {
    const currentPos = fromPlayer.position;
    const boardLength = boardTiles.length;
    let best = null, bestDist = Infinity;
    
    getActivePlayers().forEach(p => {
        if (excludeSelf && p.id === fromPlayer.id) return;
        if (p.alive === false) return;
        
        let dist = p.position - currentPos;
        if (dist < 0) dist += boardLength;
        
        if (dist < bestDist) {
            bestDist = dist;
            best = p;
        }
    });
    
    return best;
}

function findPlayerClosestToStart() {
    let best = null, maxPos = -1;
    
    getActivePlayers().forEach(p => {
        if (p.alive === false) return;
        if (p.position > maxPos) {
            maxPos = p.position;
            best = p;
        }
    });
    
    return best;
}

function findRichestAndPoorest() {
    const alive = getActivePlayers().filter(p => p.alive !== false);
    if (alive.length < 2) return { richest: null, poorest: null };
    
    let richest = alive[0], poorest = alive[0];
    alive.forEach(p => {
        if (p.money > richest.money) richest = p;
        if (p.money < poorest.money) poorest = p;
    });
    
    return { richest, poorest };
}

function findHighestRentProperty(player) {
    const props = boardTiles.filter(t => 
        t.owner === player.id && t.type === "property"
    );
    if (props.length === 0) return null;
    
    let best = props[0], bestRent = getRentByLevel(best);
    props.forEach(p => {
        const r = getRentByLevel(p);
        if (r > bestRent) { best = p; bestRent = r; }
    });
    
    return best;
}

function incrementStartLaps(player) {
    player._startLaps = (player._startLaps || 0) + 1;
    return player._startLaps;
}

function getOwnedSelectableProperties(player, minLevel, maxLevel) {
    return boardTiles.filter(t => {
        if (t.owner !== player.id) return false;
        if (t.type !== "property") return false;
        const lvl = t.level === "house" ? 1 : (t.level === "building" ? 2 : 0);
        return lvl >= minLevel && lvl <= maxLevel;
    });
}

function getOtherPlayersProperties(player) {
    return boardTiles.filter(t => 
        t.type === "property" && 
        t.owner !== null && 
        t.owner !== undefined && 
        t.owner !== player.id
    );
}

function destroyEnemyProperty(player, tileIndex) {
    const tile = boardTiles[tileIndex];
    if (!tile || tile.type !== "property") return;
    
    const el = tileElements[tileIndex];
    if (el) {
        el.style.transition = "all 0.6s cubic-bezier(.5,-0.5,.7,1.4)";
        el.style.transform = "scale(0.2) rotate(180deg)";
        el.style.opacity = "0";
    }
    
    setTimeout(() => {
        tile.owner = null;
        tile.level = null;
        tile.rentMultiplier = 1;
        if (el) {
            el.style.transition = "";
            el.style.transform = "";
            el.style.opacity = "";
        }
        updateTileVisual(tileIndex);
    }, 650);
}

function saveLastRoll(player, fromPosition, steps) {
    player._lastRollFrom = fromPosition;
    player._lastRollSteps = steps;
}

// ==========================================
// 📌 البطاقات الاستراتيجية
// ==========================================

function showDoubleBadge() {
    const old = document.getElementById("double-card-badge");
    if (old) old.remove();
    
    const center = document.querySelector('.map-center');
    if (!center) {
        const badge = document.createElement("div");
        badge.id = "double-card-badge";
        badge.className = "double-card-badge";
        badge.textContent = "🔁 ×2 البطاقة القادمة";
        document.body.appendChild(badge);
        return;
    }
    
    center.style.position = "relative";
    
    const badge = document.createElement("div");
    badge.id = "double-card-badge";
    badge.className = "double-card-badge";
    badge.textContent = "🔁 ×2 البطاقة القادمة تنفذ مرتين";
    center.appendChild(badge);
}

function hideDoubleBadge() {
    const b = document.getElementById("double-card-badge");
    if (b) b.remove();
}

function showLifeSaverButton() {
    const old = document.getElementById("life-saver-btn");
    if (old) old.remove();
    
    const btn = document.createElement("button");
    btn.id = "life-saver-btn";
    btn.className = "lifesaver-btn";
    btn.textContent = "🛟 استخدم طوق النجاة (+500)";
    btn.onclick = () => {
        const p = players[0];
        transferMoney(null, p.id, 500, () => {
            setMessage("🛟 طوق النجاة: استلمت 500$ من خزينة اللعبة");
            p._lifeSaverCard = false;
            btn.remove();
        });
    };
    document.body.appendChild(btn);
}

function checkLifeSaver() {
    const p = players[0];
    if (!p._lifeSaverCard) return;
    if (p.money <= 200 && !document.getElementById("life-saver-btn")) {
        showLifeSaverButton();
    }
}

function checkStrategicCards(player) {
    if (player._lifeSaverCard && player.money <= 200) {
        checkLifeSaver();
    }
    
    if (player._timeBombTurns !== undefined && player._timeBombTurns !== null && player._timeBombTurns > 0) {
        player._timeBombTurns--;
        if (player._timeBombTurns === 0) {
            showEventCard("💣", "انفجرت القنبلة!",
                `${player.name} خسر 400$ بعد مرور 3 أدوار`,
                "#ff4d4d", () => {
                    const amount = Math.min(400, player.money);
                    transferMoney(player.id, null, amount, () => {
                        if (player.money <= 0) handleBankruptcy(player);
                    });
                    player._timeBombTurns = null;
                });
        }
    }
}

// ==========================================
// 🎯 دالة تُستدعى عند مرور أي لاعب بالبداية
// ==========================================

function onPlayerPassStart(player) {
    incrementStartLaps(player);
    const laps = player._startLaps;
    
    players.forEach(other => {
        if (other.id === player.id) return;
        if (other._guaranteedGain && other.alive !== false) {
            other._guaranteedGain = false;
            setTimeout(() => {
                transferMoney(player.id, other.id, 250, () => {
                    setMessage(`🎯 ${other.name} استلم 250$ من بطاقة المكسب المضمون`);
                });
            }, 800);
        }
    });
    
    players.forEach(giftOwner => {
        if (giftOwner.id === player.id) return;
        if (giftOwner._poisonedGift && giftOwner._poisonedGift.active !== false && giftOwner.alive !== false) {
            setTimeout(() => {
                transferMoney(player.id, giftOwner.id, 200, () => {
                    setMessage(`🎁 ${giftOwner.name} استلم 200$ من ${player.name}`);
                });
            }, 1000);
        }
    });
    
    if (player._poisonedGift) {
        delete player._poisonedGift;
        setMessage(`🎁 انتهت الهدية المسمومة لـ ${player.name}`);
    }
    
    if (player._suspiciousGift && player._suspiciousGift.active) {
        delete player._suspiciousGift;
        setMessage(`💰 انتهت الهدية المشبوهة لـ ${player.name}`);
    }
    
    players.forEach(owner => {
        if (owner._annoyingNeighborCard && owner._annoyingNeighborCard.target === player.id) {
            if (laps >= 2) {
                delete owner._annoyingNeighborCard;
                delete player._annoyingNeighborCard;
                setMessage(`🏠 انتهت بطاقة الجار المزعج لـ ${owner.name}`);
            }
        }
    });
    
    if (player._rentCurse) {
        player._rentCurse.remainingLaps--;
        const t = boardTiles[player._rentCurse.tileIndex];
        
        if (player._rentCurse.remainingLaps <= 0) {
            delete t._cursed;
            delete t._curseOwner;
            const el = tileElements[player._rentCurse.tileIndex];
            if (el) el.style.filter = "";
            delete player._rentCurse;
            setMessage(`🌫️ انتهت لعنة الإيجار على ${t.name}`);
        } else {
            setMessage(`🌫️ ${t.name} ملعونة — باقي ${player._rentCurse.remainingLaps} مرور بالبداية`);
        }
    }
    
    if (player._timeRunningOut && !player._timeRunningOut.success) {
        const lapsCompleted = player._startLaps - player._timeRunningOut.startLaps;
        if (lapsCompleted >= 3) {
            showInfoCard("⏳", "الوقت انتهى!", "لم تصل لبوابة العالم خلال 3 لفّات!\nتخسر 700$", "#ff4d4d");
            setTimeout(() => {
                const amount = Math.min(700, player.money);
                transferMoney(player.id, null, amount, () => {
                    if (player.money <= 0) handleBankruptcy(player);
                });
                delete player._timeRunningOut;
            }, 1500);
        }
    }
    
    if (player._treasuryDebt) {
        setTimeout(() => {
            transferMoney(player.id, null, player._treasuryDebt, () => {
                setMessage(`📜 تم خصم ${player._treasuryDebt}$ دين الخزينة من ${player.name}`);
                player._treasuryDebt = null;
                if (player.money <= 0) handleBankruptcy(player);
            });
        }, 1200);
    }
    
    if (player.human) checkLifeSaver();
}

// ==========================================
// 🚶 خطوات الحركة
// ==========================================

function movePlayerSteps(player, steps, isDouble, onComplete, silent) {
    if (steps === 0) { 
        if (onComplete) onComplete();
        else handleLanding(player, isDouble); 
        return; 
    }
    
    saveLastRoll(player, player.position, steps);
    
    gameSession.moving = true;
    let remaining = Math.abs(steps);
    const direction = steps > 0 ? 1 : -1;

    const step = () => {
        if (remaining <= 0) {
            gameSession.moving = false;
            if (onComplete) onComplete();
            else handleLanding(player, isDouble);
            return;
        }
        const oldPos = player.position;
        player.position = (player.position + direction + boardTiles.length) % boardTiles.length;
        if (direction === 1 && player.position === 0 && oldPos !== 0) {
            updateToken(player); updateActiveToken();
            onPlayerPassStart(player);
            transferMoney(null, player.id, 250, null);
            remaining--;
            setTimeout(step, 280);
            return;
        }
        updateToken(player); updateActiveToken();
        remaining--;
        setTimeout(step, 280);
    };
    step();
}

// ==========================================
// ✨ Effect التبديل بين اللاعبين
// ==========================================

function playSwapEffect(playerA, playerB) {
    const tokenA = playerTokens[playerA.id];
    const tokenB = playerTokens[playerB.id];
    
    if (tokenA) {
        tokenA.classList.add("swap-effect");
        setTimeout(() => tokenA.classList.remove("swap-effect"), 1900);
    }
    if (tokenB) {
        tokenB.classList.add("swap-effect");
        setTimeout(() => tokenB.classList.remove("swap-effect"), 1900);
    }
    
    setTimeout(() => {
        const posA = getPlayerTokenScreenPos(playerA.id);
        const posB = getPlayerTokenScreenPos(playerB.id);
        
        if (posA && posB) {
            const dx = posB.x - posA.x;
            const dy = posB.y - posA.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            const line = document.createElement("div");
            line.className = "swap-flash-line";
            line.style.left = posA.x + "px";
            line.style.top = posA.y + "px";
            line.style.width = dist + "px";
            line.style.transform = `translateY(-50%) rotate(${angle}deg)`;
            
            document.body.appendChild(line);
            setTimeout(() => line.remove(), 1100);
        }
    }, 400);
}

function getPlayerTokenScreenPos(playerId) {
    const token = playerTokens[playerId];
    if (!token) return null;
    const r = token.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ==========================================
// 28. حجر ورقة مقص (المحلي — للبوتات فقط)
// ==========================================

const rpsChoices = {
    rock:     { name: "حجر",  icon: "✊" },
    paper:    { name: "ورقة", icon: "✋" },
    scissors: { name: "مقص",  icon: "✌️" }
};

const rpsSession = {
    active: false, currentMatch: 0, matches: [],
    winners: [], losers: [], humanChoice: null, scores: {}
};

function startRPS() {
    stopTimer();
    rpsSession.active = true;
    rpsSession.currentMatch = 0;
    rpsSession.matches = [];
    rpsSession.winners = [];
    rpsSession.losers = [];
    rpsSession.humanChoice = null;
    rpsSession.scores = {};

    players[0].name = playerData.name;

    players.forEach(p => {
        p.money = 1000; p.position = 0;
        p.skipNextTurn = false; p.freeJailCard = false;
        p.airportPending = false; p.jailTurns = 0;
        p.airportVisits = 0;
        p._usedPlanThisTurn = false;
        p.alive = activePlayerIds.includes(p.id);
    });

    boardTiles.forEach(t => {
        if (t.type === "property" || t.type === "station") { t.owner = null; t.level = null; }
        if (t.type === "property") t.rentMultiplier = 1;
    });

    const active = getActivePlayers();
    const shuffled = [...active].sort(() => Math.random() - 0.5);

    if (gameMode === "1v1") rpsSession.matches[0] = [shuffled[0], shuffled[1]];
    else if (gameMode === "1v1v1") rpsSession.matches[0] = [shuffled[0], shuffled[1]];
    else if (gameMode === "1v1v1v1") {
        rpsSession.matches[0] = [shuffled[0], shuffled[1]];
        rpsSession.matches[1] = [shuffled[2], shuffled[3]];
    } else if (gameMode === "2v2") {
        rpsSession.matches[0] = [players[0], players[2]];
        rpsSession.matches[1] = [players[1], players[3]];
    }

    lobbyScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    showRPSMatch();
}

function showRPSMatch() {
    stopTimer();
    let screen = document.getElementById("rps-screen");
    if (!screen) {
        screen = document.createElement("div");
        screen.id = "rps-screen";
        screen.className = "rps-screen";
        document.body.appendChild(screen);
    }

    const match = rpsSession.matches[rpsSession.currentMatch];
    if (!match) { finishRPS(); return; }

    const playerA = match[0];
    const playerB = match[1];
    rpsSession.humanChoice = null;

    let title = "";
    if (gameMode === "1v1") title = "مباراة 1 ضد 1";
    else if (gameMode === "1v1v1") title = rpsSession.currentMatch === 0 ? "المباراة 1" : (rpsSession.currentMatch === 1 ? "المباراة 2" : "المباراة النهائية");
    else if (gameMode === "1v1v1v1") title = rpsSession.currentMatch === 0 ? "نصف النهائي - 1" : rpsSession.currentMatch === 1 ? "نصف النهائي - 2" : rpsSession.currentMatch === 2 ? "النهائي" : "المركز الثالث";
    else if (gameMode === "2v2") title = rpsSession.currentMatch === 0 ? "المباراة 1" : "المباراة 2";

    screen.innerHTML = `
        <div class="rps-panel">
            <div class="rps-title">حجر - ورقة - مقص</div>
            <div class="rps-match-title">${title}</div>
            <div id="rps-timer" class="decision-timer"></div>
            <div class="rps-players">
                <div class="rps-player">
                    <div class="rps-player-name">${playerA.name}</div>
                    <div id="rps-hand-a" class="rps-hand">؟</div>
                </div>
                <div class="rps-vs">VS</div>
                <div class="rps-player">
                    <div class="rps-player-name">${playerB.name}</div>
                    <div id="rps-hand-b" class="rps-hand">؟</div>
                </div>
            </div>
            <div id="rps-countdown" class="rps-countdown"></div>
            <div id="rps-message" class="rps-message"></div>
            <div id="rps-choices" class="rps-choices"></div>
        </div>
    `;

    if (playerA.human || playerB.human) {
        showRPSChoices();
        const timer = document.getElementById("rps-timer");
        startRPSTimer(10, timer, () => {
            const opts = Object.keys(rpsChoices);
            handleHumanChoice(opts[Math.floor(Math.random() * opts.length)]);
        });
    } else {
        setTimeout(() => startAIMatch(), 1200);
    }
}

function showRPSChoices() {
    const choices = document.getElementById("rps-choices");
    if (!choices) return;
    choices.innerHTML = `
        <button class="rps-choice" data-choice="rock"><span>✊</span><small>حجر</small></button>
        <button class="rps-choice" data-choice="paper"><span>✋</span><small>ورقة</small></button>
        <button class="rps-choice" data-choice="scissors"><span>✌️</span><small>مقص</small></button>
    `;
    choices.querySelectorAll(".rps-choice").forEach(btn => {
        btn.onclick = () => handleHumanChoice(btn.dataset.choice);
    });
}

function handleHumanChoice(choice) {
    if (!rpsSession.active || rpsSession.humanChoice) return;
    stopTimer(); stopRPSTimer();
    rpsSession.humanChoice = choice;

    const match = rpsSession.matches[rpsSession.currentMatch];
    if (!match) return;

    const opts = Object.keys(rpsChoices);
    const aiChoice = opts[Math.floor(Math.random() * opts.length)];

    let choiceA, choiceB;
    if (match[0].human) { choiceA = choice; choiceB = aiChoice; }
    else { choiceA = aiChoice; choiceB = choice; }

    playRound(match[0], match[1], choiceA, choiceB);
}

function startAIMatch() {
    const match = rpsSession.matches[rpsSession.currentMatch];
    if (!match) return;
    const opts = Object.keys(rpsChoices);
    const choiceA = opts[Math.floor(Math.random() * opts.length)];
    const choiceB = opts[Math.floor(Math.random() * opts.length)];
    playRound(match[0], match[1], choiceA, choiceB);
}

function playRound(playerA, playerB, choiceA, choiceB) {
    stopTimer();
    const countdown = document.getElementById("rps-countdown");
    const handA = document.getElementById("rps-hand-a");
    const handB = document.getElementById("rps-hand-b");

    if (handA) { handA.textContent = "?"; handA.classList.remove("rps-hand-show"); }
    if (handB) { handB.textContent = "?"; handB.classList.remove("rps-hand-show"); }

    let count = 3;
    if (countdown) countdown.textContent = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            if (countdown) countdown.textContent = count;
        } else {
            clearInterval(interval);
            if (countdown) countdown.textContent = "انطلق!";
            if (handA) { handA.textContent = rpsChoices[choiceA].icon; handA.classList.add("rps-hand-show"); }
            if (handB) { handB.textContent = rpsChoices[choiceB].icon; handB.classList.add("rps-hand-show"); }

            const winner = determineWinner(playerA, playerB, choiceA, choiceB);
            setTimeout(() => {
                if (!winner) {
                    const msg = document.getElementById("rps-message");
                    if (msg) msg.textContent = "تعادل! إعادة...";
                    setTimeout(() => { rpsSession.humanChoice = null; showRPSMatch(); }, 1500);
                    return;
                }
                finishMatch(winner, playerA, playerB);
            }, 1200);
        }
    }, 700);
}

function determineWinner(playerA, playerB, choiceA, choiceB) {
    if (choiceA === choiceB) return null;
    if ((choiceA === "rock" && choiceB === "scissors") ||
        (choiceA === "paper" && choiceB === "rock") ||
        (choiceA === "scissors" && choiceB === "paper")) return playerA;
    return playerB;
}

function finishMatch(winner, playerA, playerB) {
    const loser = (winner.id === playerA.id) ? playerB : playerA;
    const msg = document.getElementById("rps-message");
    if (msg) msg.textContent = `${winner.name} فاز!`;

    if (!rpsSession.scores[winner.id]) rpsSession.scores[winner.id] = 0;
    rpsSession.scores[winner.id]++;
    rpsSession.winners.push(winner);
    rpsSession.losers.push(loser);

    setTimeout(() => {
        rpsSession.currentMatch++;

        if (gameMode === "1v1") { startingOrder = [winner, loser]; finishRPS(); return; }

        if (gameMode === "1v1v1") {
            const active = getActivePlayers();
            if (rpsSession.currentMatch === 1) {
                const thirdPlayer = active.find(p => p.id !== playerA.id && p.id !== playerB.id);
                rpsSession.matches[1] = [winner, thirdPlayer];
                showRPSMatch(); return;
            }
            if (rpsSession.currentMatch === 2) {
                rpsSession.matches[2] = [rpsSession.losers[0], rpsSession.losers[1]];
                showRPSMatch(); return;
            }
            if (rpsSession.currentMatch >= 3) {
                startingOrder = [rpsSession.winners[1], rpsSession.winners[2], rpsSession.losers[2]];
                finishRPS(); return;
            }
        }

        if (gameMode === "1v1v1v1") {
            if (rpsSession.currentMatch === 2) {
                rpsSession.matches[2] = [rpsSession.winners[0], rpsSession.winners[1]];
                rpsSession.matches[3] = [rpsSession.losers[0], rpsSession.losers[1]];
            }
            if (rpsSession.currentMatch <= 3) showRPSMatch();
            else finishRPS();
            return;
        }

        if (gameMode === "2v2") {
            if (rpsSession.currentMatch <= 1) showRPSMatch();
            else {
                const sorted = [...activePlayerIds].sort((a, b) => (rpsSession.scores[b] || 0) - (rpsSession.scores[a] || 0));
                startingOrder = sorted.map(id => players[id]);
                finishRPS();
            }
            return;
        }
    }, 1500);
}

function finishRPS() {
    stopTimer(); stopRPSTimer();
    rpsSession.active = false;
    const screen = document.getElementById("rps-screen");
    if (!screen) return;

    if (gameMode === "1v1v1v1" && startingOrder.length !== 4) {
        const lastTwoWinners = rpsSession.winners.slice(-2);
        const lastTwoLosers = rpsSession.losers.slice(-2);
        startingOrder = [lastTwoWinners[0], lastTwoLosers[0], lastTwoWinners[1], lastTwoLosers[1]];
    }
    if (gameMode === "2v2" && startingOrder.length !== 4) {
        const sorted = [...activePlayerIds].sort((a, b) => (rpsSession.scores[b] || 0) - (rpsSession.scores[a] || 0));
        startingOrder = sorted.map(id => players[id]);
    }

    let modeLabel = "";
    if (gameMode === "1v1") modeLabel = "1 ضد 1";
    if (gameMode === "1v1v1") modeLabel = "1 ضد 1 ضد 1";
    if (gameMode === "1v1v1v1") modeLabel = "4 لاعبين";
    if (gameMode === "2v2") modeLabel = "2 ضد 2";

    let teamsHTML = "";
    if (gameMode === "2v2" && teams) {
        teamsHTML = `
            <div style="margin-top:15px; color:#5a3a10; font-size:14px; text-align:center;">
                <div>الفريق الأول: <b>${players[teams[0][0]].name} + ${players[teams[0][1]].name}</b></div>
                <div>الفريق الثاني: <b>${players[teams[1][0]].name} + ${players[teams[1][1]].name}</b></div>
            </div>`;
    }

    screen.innerHTML = `
        <div class="rps-panel">
            <h2 class="rps-title">${modeLabel}</h2>
            <div style="color:#8a6d1f; font-size:16px; font-weight:900; margin-bottom:15px;">ترتيب البداية</div>
            <div class="starting-order">
                ${startingOrder.map((p, i) => `
                    <div class="starting-place ${i === 0 ? "first-place" : ""}">
                        <div class="place-number">${i + 1}</div>
                        <div>${p.name}</div>
                    </div>
                `).join("")}
            </div>
            ${teamsHTML}
            <div class="starting-message">${startingOrder[0].name} سيبدأ أولاً</div>
            <button id="start-real-game-btn" class="rps-continue">ابدأ الرحلة</button>
        </div>
    `;

    const btn = document.getElementById("start-real-game-btn");
    if (btn) btn.onclick = startRealGame;
}

function startRealGame() {
    stopTimer();
    const screen = document.getElementById("rps-screen");
    if (screen) screen.remove();

    gameSession.active = true;
    gameSession.moving = false;
    gameSession.currentPlayer = startingOrder[0].id;
    gameSession.consecutiveDoubles = 0;
    gameSession.awaitingRoll = false;
    gameSession.airportSelecting = false;
    gameSession.airportPlayer = null;
    gameSession.doubleRentSelecting = false;
    gameSession.doubleRentPlayer = null;
    gameSession.freeUpgradeSelecting = false;
    gameSession.freeUpgradePlayer = null;

    getActivePlayers().forEach(p => {
        p.position = 0;
        p.airportVisits = 0;
        p._usedPlanThisTurn = false;
    });

    createMap();
    updateTurnUI();
    updateActiveToken();
}

function startRPSTimer(seconds, element, onEnd) {
    stopRPSTimer();
    let remaining = seconds;
    const update = () => {
        if (!element) return;
        element.textContent = "الوقت: " + remaining;
        element.classList.toggle("decision-timer-danger", remaining <= 3);
    };
    update();
    rpsTimerInterval = setInterval(() => {
        remaining--;
        update();
        if (remaining <= 0) { stopRPSTimer(); if (onEnd) onEnd(); }
    }, 1000);
}

function stopRPSTimer() {
    if (rpsTimerInterval) { clearInterval(rpsTimerInterval); rpsTimerInterval = null; }
}

// ==========================================
// 29. Watchdog
// ==========================================

let _movingStartTime = null;
setInterval(() => {
    if (!gameSession.active) { _movingStartTime = null; return; }
    if (gameSession.moving) {
        if (!_movingStartTime) _movingStartTime = Date.now();
        if (Date.now() - _movingStartTime > 25000) {
            gameSession.moving = false;
            _movingStartTime = null;
            updateTurnUI();
        }
    } else {
        _movingStartTime = null;
    }
}, 3000);

// ==========================================
// 30. لوحة المطور
// ==========================================

const debugState = {
    enabled: false, infiniteMoney: false, forcedDice: null,
    noJailFromDoubles: false, noTimer: false
};

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        toggleDebugPanel();
    }
});

window.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") setTimeout(() => toggleDebugPanel(true), 500);
});

function toggleDebugPanel(forceOpen) {
    debugState.enabled = (forceOpen === true) ? true : !debugState.enabled;
    let toggleBtn = document.getElementById("debug-toggle");
    let panel = document.getElementById("debug-panel");

    if (!toggleBtn) {
        toggleBtn = document.createElement("button");
        toggleBtn.id = "debug-toggle";
        toggleBtn.textContent = "D";
        toggleBtn.onclick = () => toggleDebugPanel();
        document.body.appendChild(toggleBtn);
    }
    if (!panel) {
        panel = buildDebugPanel();
        document.body.appendChild(panel);
    }

    if (debugState.enabled) {
        panel.classList.remove("hidden");
        toggleBtn.style.display = "none";
        refreshDebugPanel();
    } else {
        panel.classList.add("hidden");
        toggleBtn.style.display = "flex";
    }
}

function buildDebugPanel() {
    const panel = document.createElement("div");
    panel.id = "debug-panel";
    panel.classList.add("hidden");
    panel.innerHTML = `
        <div class="debug-header">
            <h3>DEV PANEL</h3>
            <button class="debug-close" onclick="toggleDebugPanel()">×</button>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Status</div>
            <div id="debug-status-content" class="debug-info">Loading...</div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Money</div>
            <div class="debug-row">
                <button class="success" onclick="debugAddMoney(1000)">+1000</button>
                <button class="success" onclick="debugAddMoney(10000)">+10k</button>
                <button class="success" onclick="debugAddMoney(100000)">+100k</button>
            </div>
            <div class="debug-row">
                <button class="danger" onclick="debugSetMoney(0)">Set 0</button>
                <button class="gold" onclick="debugMaxMoney()">MAX</button>
                <button onclick="debugAddMoneyToAll(5000)">لكل اللاعبين +5000</button>
            </div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Player</div>
            <div class="debug-row"><select id="debug-player-select"></select></div>
            <div class="debug-row">
                <button onclick="debugSetCurrentTurn()">دوره</button>
                <button class="danger" onclick="debugKillPlayer()">اقتله</button>
                <button class="success" onclick="debugRevivePlayer()">أحييه</button>
            </div>
            <div class="debug-row">
                <button onclick="debugSkipPlayerJail()">فك المحطة</button>
                <button onclick="debugSendToJail()">للمحطة السوداء</button>
            </div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Position</div>
            <div class="debug-row"><select id="debug-tile-select"></select></div>
            <div class="debug-row"><button class="gold" onclick="debugTeleportPlayer()">انتقل للخانة</button></div>
            <div class="debug-row">
                <button onclick="debugMovePlayer(1)">+1</button>
                <button onclick="debugMovePlayer(5)">+5</button>
                <button onclick="debugMovePlayer(-5)">-5</button>
                <button onclick="debugMovePlayer(-1)">-1</button>
            </div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Properties</div>
            <div class="debug-row">
                <button class="success" onclick="debugOwnCurrentTile()">امتلك</button>
                <button class="danger" onclick="debugReleaseCurrentTile()">حرر</button>
            </div>
            <div class="debug-row"><button class="gold" onclick="debugUpgradeCurrentTile()">طوّر</button></div>
            <div class="debug-row"><button class="gold" onclick="debugDoubleCurrentRent()">ضاعف الإيجار ×2</button></div>
            <div class="debug-row">
                <button class="gold" onclick="debugOwnAllTiles()">امتلك الكل</button>
                <button class="danger" onclick="debugReleaseAllTiles()">حرر الكل</button>
            </div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Dice</div>
            <div class="debug-row">
                <button onclick="debugForceDice(1,1)">1-1</button>
                <button onclick="debugForceDice(6,6)">6-6</button>
                <button class="danger" onclick="debugForceDice(null,null)">إلغاء</button>
            </div>
            <div class="debug-row"><button class="success" onclick="debugInstantRoll()">ارمي فوراً</button></div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Actions</div>
            <div class="debug-row">
                <button onclick="debugNextTurn()">الدور التالي</button>
                <button onclick="debugEndMove()">خلص الحركة</button>
            </div>
            <div class="debug-row">
                <button onclick="debugTriggerChance()">ضربة حظ</button>
                <button onclick="debugTriggerChest()">خزينة</button>
            </div>
            <div class="debug-row"><button class="gold" onclick="debugWinNow()">فوز فوري</button></div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Toggles</div>
            <div class="debug-toggle-row"><span>فلوس لا نهائية</span><div class="debug-switch" id="dbg-infinite-money" onclick="debugToggleInfiniteMoney()"></div></div>
            <div class="debug-toggle-row"><span>منع دخول المحطة</span><div class="debug-switch" id="dbg-no-jail" onclick="debugToggleNoJail()"></div></div>
            <div class="debug-toggle-row"><span>إلغاء التايمر</span><div class="debug-switch" id="dbg-no-timer" onclick="debugToggleNoTimer()"></div></div>
        </div>
        <div class="debug-section">
            <div class="debug-section-title">Danger</div>
            <div class="debug-row">
                <button class="danger" onclick="debugResetGame()">إعادة اللعبة</button>
                <button class="danger" onclick="debugBackToLobby()">رجوع اللوبي</button>
            </div>
        </div>
    `;
    return panel;
}

function refreshDebugPanel() {
    const statusEl = document.getElementById("debug-status-content");
    const playerSelect = document.getElementById("debug-player-select");
    const tileSelect = document.getElementById("debug-tile-select");

    if (statusEl) {
        const current = players[gameSession.currentPlayer];
        statusEl.innerHTML = `
            <b style="color:#4dff88;">Active:</b> ${gameSession.active ? "yes" : "no"}<br>
            <b style="color:#4dff88;">Mode:</b> ${gameMode}<br>
            <b style="color:#4dff88;">Current:</b> ${current ? current.name : "-"}<br>
            <b style="color:#4dff88;">Moving:</b> ${gameSession.moving ? "yes" : "no"}<br>
            <b style="color:#4dff88;">Awaiting:</b> ${gameSession.awaitingRoll ? "yes" : "no"}
        `;
    }

    if (playerSelect && playerSelect.options.length === 0) {
        players.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = `#${p.id} ${p.name}`;
            playerSelect.appendChild(opt);
        });
    }
    if (playerSelect) playerSelect.value = gameSession.currentPlayer;

    if (tileSelect && tileSelect.options.length === 0) {
        boardTiles.forEach((t, i) => {
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = `#${i} ${t.name}`;
            tileSelect.appendChild(opt);
        });
    }
    const cur = players[gameSession.currentPlayer];
    if (tileSelect && cur) tileSelect.value = cur.position;
}

function getDebugPlayer() {
    const sel = document.getElementById("debug-player-select");
    const id = sel ? parseInt(sel.value) : gameSession.currentPlayer;
    return players[id];
}

function debugAddMoney(a) { const p = getDebugPlayer(); if (p) { p.money += a; showFloatingMoney(p.id, a); updatePlayersDisplay(); refreshDebugPanel(); } }
function debugSetMoney(v) { const p = getDebugPlayer(); if (p) { p.money = v; updatePlayersDisplay(); refreshDebugPanel(); } }
function debugMaxMoney() { debugSetMoney(999999); }
function debugAddMoneyToAll(a) { players.forEach(p => { p.money += a; showFloatingMoney(p.id, a); }); updatePlayersDisplay(); refreshDebugPanel(); }
function debugSetCurrentTurn() { const p = getDebugPlayer(); if (p) { gameSession.currentPlayer = p.id; gameSession.moving = false; gameSession.awaitingRoll = false; updateTurnUI(); refreshDebugPanel(); } }
function debugKillPlayer() { const p = getDebugPlayer(); if (p) { handleBankruptcy(p); refreshDebugPanel(); } }
function debugRevivePlayer() { const p = getDebugPlayer(); if (p) { p.alive = true; p.money = 1000; updatePlayersDisplay(); updateActiveToken(); refreshDebugPanel(); } }
function debugSkipPlayerJail() { const p = getDebugPlayer(); if (p) { p.jailTurns = 0; updatePlayersDisplay(); refreshDebugPanel(); } }
function debugSendToJail() { const p = getDebugPlayer(); if (p) { p.position = 8; p.jailTurns = 2; updateToken(p); updateActiveToken(); updatePlayersDisplay(); refreshDebugPanel(); } }
function debugTeleportPlayer() {
    const p = getDebugPlayer();
    const sel = document.getElementById("debug-tile-select");
    if (p && sel) { p.position = parseInt(sel.value); updateToken(p); updateActiveToken(); updatePlayersDisplay(); refreshDebugPanel(); }
}
function debugMovePlayer(s) { const p = getDebugPlayer(); if (p) { p.position = (p.position + s + boardTiles.length) % boardTiles.length; updateToken(p); updateActiveToken(); updatePlayersDisplay(); refreshDebugPanel(); } }
function debugOwnCurrentTile() {
    const p = getDebugPlayer(); if (!p) return;
    const tile = boardTiles[p.position];
    if (tile.type !== "property" && tile.type !== "station") return;
    tile.owner = p.id;
    if (tile.type === "property" && !tile.level) tile.level = "house";
    updateTileVisual(p.position); updatePlayersDisplay(); refreshDebugPanel();
}
function debugReleaseCurrentTile() {
    const p = getDebugPlayer(); if (!p) return;
    const tile = boardTiles[p.position];
    tile.owner = null; tile.level = null;
    if (tile.type === "property") tile.rentMultiplier = 1;
    updateTileVisual(p.position); updatePlayersDisplay(); refreshDebugPanel();
}
function debugUpgradeCurrentTile() {
    const p = getDebugPlayer(); if (!p) return;
    const tile = boardTiles[p.position];
    if (tile.type !== "property") return;
    if (tile.owner === null || tile.owner === undefined) tile.owner = p.id;
    tile.level = "building";
    updateTileVisual(p.position); refreshDebugPanel();
}
function debugDoubleCurrentRent() {
    const p = getDebugPlayer(); if (!p) return;
    const tile = boardTiles[p.position];
    if (tile.type !== "property") return;
    if (tile.owner === null || tile.owner === undefined) return;
    tile.rentMultiplier = (tile.rentMultiplier || 1) * 2;
    updateTileVisual(p.position); refreshDebugPanel();
}
function debugOwnAllTiles() {
    const p = getDebugPlayer(); if (!p) return;
    boardTiles.forEach((tile, i) => {
        if (tile.type === "property" || tile.type === "station") {
            tile.owner = p.id;
            if (tile.type === "property") tile.level = "building";
            updateTileVisual(i);
        }
    });
    updatePlayersDisplay(); refreshDebugPanel();
}
function debugReleaseAllTiles() {
    boardTiles.forEach((tile, i) => {
        if (tile.type === "property" || tile.type === "station") {
            tile.owner = null; tile.level = null;
            if (tile.type === "property") tile.rentMultiplier = 1;
            updateTileVisual(i);
        }
    });
    updatePlayersDisplay(); refreshDebugPanel();
}
function debugForceDice(d1, d2) {
    console.log('Force dice not supported in online mode');
}
function debugInstantRoll() {
    if (currentRoom) {
        socket.emit('game:roll', { room_id: currentRoom.id });
    }
}
function debugNextTurn() { gameSession.moving = false; gameSession.awaitingRoll = false; nextTurn(); refreshDebugPanel(); }
function debugEndMove() {
    if (currentRoom) {
        socket.emit('game:animation_done', { room_id: currentRoom.id });
    }
}
function debugTriggerChance() { const p = players[gameSession.currentPlayer]; if (p) executeChanceCard(p, false); }
function debugTriggerChest() { const p = players[gameSession.currentPlayer]; if (p) { const r = Math.floor(Math.random() * 500) + 200; p.money += r; showFloatingMoney(p.id, r); updatePlayersDisplay(); showEventCard("خزينة", "خزينة", `${p.name} حصل على ${r}$`, "#7dba8a", () => {}); } }
function debugWinNow() { const p = getDebugPlayer(); if (p) declareWinner(p, "فوز مباشر"); }
function debugToggleInfiniteMoney() { debugState.infiniteMoney = !debugState.infiniteMoney; document.getElementById("dbg-infinite-money").classList.toggle("on", debugState.infiniteMoney); }
function debugToggleNoJail() { debugState.noJailFromDoubles = !debugState.noJailFromDoubles; document.getElementById("dbg-no-jail").classList.toggle("on", debugState.noJailFromDoubles); }
function debugToggleNoTimer() { debugState.noTimer = !debugState.noTimer; document.getElementById("dbg-no-timer").classList.toggle("on", debugState.noTimer); if (debugState.noTimer) stopTimer(); }
function debugResetGame() {
    if (!confirm("إعادة تشغيل اللعبة؟")) return;
    players.forEach(p => { p.money = 1000; p.position = 0; p.alive = activePlayerIds.includes(p.id); p.skipNextTurn = false; p.freeJailCard = false; p.airportPending = false; p.jailTurns = 0; p.airportVisits = 0; p._usedPlanThisTurn = false; });
    boardTiles.forEach((t, i) => {
        if (t.type === "property" || t.type === "station") { t.owner = null; t.level = null; }
        if (t.type === "property") t.rentMultiplier = 1;
        updateTileVisual(i);
    });
    gameSession.active = false; gameSession.moving = false; gameSession.currentPlayer = 0; gameSession.consecutiveDoubles = 0; gameSession.awaitingRoll = false;
    stopTimer(); startRPS(); refreshDebugPanel();
}
function debugBackToLobby() {
    if (!confirm("ترجع للوبي؟")) return;
    gameSession.active = false; gameSession.moving = false;
    stopTimer(); cancelAirportSelection(); cancelDoubleRentSelection(true); cancelFreeUpgradeSelection(true);
    document.getElementById("rps-screen")?.remove();
    document.getElementById("event-card")?.remove();
    document.getElementById("player-info-modal")?.remove();
    document.getElementById("tile-info-dialog")?.remove();
    document.getElementById("plan-choice-dialog")?.remove();
    gameScreen.classList.add("hidden");
    lobbyScreen.classList.remove("hidden");
}

setInterval(() => {
    if (!debugState.infiniteMoney) return;
    players.forEach(p => { if (p.money < 100) p.money = 999999; });
    updatePlayersDisplay();
}, 1000);

// ==========================================
// أدوات مساعدة
// ==========================================
async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
}

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

// ==========================================
// فتح/غلق النوافذ
// ==========================================
document.getElementById('openFriendsBtn').onclick = () => {
    showModal('friendsModal');
    loadFriends();
};

document.getElementById('closeFriendsBtn').onclick = () => hideModal('friendsModal');
document.getElementById('closeAddFriendBtn').onclick = () => hideModal('addFriendModal');
document.getElementById('closeRequestsBtn').onclick = () => hideModal('requestsModal');

document.getElementById('openAddFriendBtn').onclick = () => showModal('addFriendModal');
document.getElementById('openRequestsBtn').onclick = () => {
    showModal('requestsModal');
    loadRequests();
};

// ==========================================
// تحميل قائمة الأصدقاء
// ==========================================
async function loadFriends() {
    try {
        const data = await apiCall('/api/friends');
        document.getElementById('friendsCount').textContent = data.count;

        const list = document.getElementById('friendsList');
        const empty = document.getElementById('friendsEmpty');

        list.querySelectorAll('.friend-card').forEach(el => el.remove());

        if (data.count === 0) {
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        data.friends.forEach(f => {
            const card = document.createElement('div');
            card.className = 'friend-card' + (f.is_favorite ? ' favorite' : '');

            let statusClass = 'offline';
            let statusText = 'غير متصل';
            if (f.status === 'online' && f.in_match) {
                statusClass = 'in-match';
                statusText = 'في مباراة';
            } else if (f.status === 'online') {
                statusClass = 'online';
                statusText = 'متصل';
            }

            card.innerHTML = `
                <div class="friend-avatar">${f.username[0]}</div>
                <div class="friend-info">
                    <div class="friend-name">${f.username}</div>
                    <div class="friend-status ${statusClass}">${statusText} • المستوى ${f.level}</div>
                </div>
                <div class="friend-card-actions">
                    <button data-action="favorite" data-id="${f.id}">
                        ${f.is_favorite ? '★' : '☆'}
                    </button>
                    <button data-action="invite" data-id="${f.id}">دعوة</button>
                    <button data-action="remove" data-id="${f.id}">إزالة</button>
                </div>
            `;
            list.appendChild(card);
        });

        list.querySelectorAll('.friend-card-actions button').forEach(btn => {
            btn.onclick = () => handleFriendAction(btn.dataset.action, btn.dataset.id);
        });

    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// إجراء على صديق
// ==========================================
async function handleFriendAction(action, id) {
    try {
        if (action === 'favorite') {
            await apiCall(`/api/friends/favorite/${id}`, 'POST');
            loadFriends();
 } else if (action === 'invite') {
    // ✅ دعوة لوبي
    if (socket && socket.connected) {
        socket.emit('lobby:invite_send', { to_user_id: parseInt(id) });
        setMessage('🏠 تم إرسال دعوة المجموعة');
    } else {
        alert('غير متصل بالسيرفر');
    }
}
    } catch (e) {
        alert(e.message);
    }
}

// ==========================================
// البحث عن لاعب
// ==========================================
document.getElementById('searchBtn').onclick = async () => {
    const q = document.getElementById('searchUsernameInput').value.trim();
    if (!q) return;

    try {
        const data = await apiCall(`/api/friends/search?q=${encodeURIComponent(q)}`);
        const results = document.getElementById('searchResults');
        results.innerHTML = '';

        if (data.users.length === 0) {
            results.innerHTML = '<p>لا توجد نتائج.</p>';
            return;
        }

        data.users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'friend-card';
            div.innerHTML = `
                <div class="friend-avatar">${u.username[0]}</div>
                <div class="friend-info">
                    <div class="friend-name">${u.username}</div>
                    <div class="friend-status">المستوى ${u.level}</div>
                </div>
                <button class="btn-primary" data-username="${u.username}">إضافة</button>
            `;
            div.querySelector('button').onclick = async () => {
                try {
                    const res = await apiCall('/api/friends/request', 'POST', { username: u.username });
                    alert(res.message);
                    div.querySelector('button').disabled = true;
                    div.querySelector('button').textContent = 'تم الإرسال';
                } catch (e) {
                    alert(e.message);
                }
            };
            results.appendChild(div);
        });
    } catch (e) {
        alert(e.message);
    }
};

// ==========================================
// تحميل الطلبات
// ==========================================
async function loadRequests() {
    try {
        const data = await apiCall('/api/friends/requests');

        const incoming = document.getElementById('incomingRequests');
        const outgoing = document.getElementById('outgoingRequests');
        incoming.innerHTML = '';
        outgoing.innerHTML = '';

        if (data.incoming.length === 0) {
            incoming.innerHTML = '<p>لا توجد طلبات واردة.</p>';
        } else {
            data.incoming.forEach(r => {
                const div = document.createElement('div');
                div.className = 'friend-card';
                div.innerHTML = `
                    <div class="friend-avatar">${r.user.username[0]}</div>
                    <div class="friend-info">
                        <div class="friend-name">${r.user.username}</div>
                    </div>
                    <button class="btn-primary" data-action="accept" data-id="${r.id}">قبول</button>
                    <button class="btn-secondary" data-action="reject" data-id="${r.id}">رفض</button>
                `;
                div.querySelectorAll('button').forEach(btn => {
                    btn.onclick = async () => {
                        try {
                            const res = await apiCall(`/api/friends/${btn.dataset.action}`, 'POST', { request_id: btn.dataset.id });
                            alert(res.message);
                            loadRequests();
                            loadFriends();
                        } catch (e) { alert(e.message); }
                    };
                });
                incoming.appendChild(div);
            });
        }

        if (data.outgoing.length === 0) {
            outgoing.innerHTML = '<p>لا توجد طلبات مرسلة.</p>';
        } else {
            data.outgoing.forEach(r => {
                const div = document.createElement('div');
                div.className = 'friend-card';
                div.innerHTML = `
                    <div class="friend-avatar">${r.user.username[0]}</div>
                    <div class="friend-info">
                        <div class="friend-name">${r.user.username}</div>
                        <div class="friend-status">في انتظار الموافقة</div>
                    </div>
                `;
                outgoing.appendChild(div);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// تحديث حالة التواجد
// ==========================================
async function updatePresence(status, inMatch = false) {
    try {
        await apiCall('/api/friends/presence', 'POST', { status, in_match: inMatch });
    } catch (e) {
        console.error(e);
    }
}

updatePresence('online', false);

window.addEventListener('beforeunload', () => {
    navigator.sendBeacon('/api/friends/presence',
        new Blob([JSON.stringify({ status: 'offline', in_match: false })],
        { type: 'application/json' }));
});

// ==========================================
// شاشة اختيار الشخصية الأولى
// ==========================================

let selectedStarterId = null;

function openStarterScreen() {
    const grid = document.getElementById('starter-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (typeof charactersData === 'undefined' || !Array.isArray(charactersData)) {
        console.error('charactersData غير معرف');
        return;
    }

    charactersData.forEach(char => {
        const card = document.createElement('div');
        card.className = 'starter-card';
        card.dataset.id = char.id;
        card.innerHTML = `
            <div class="starter-img-wrapper">
                <img src="${char.image}" alt="${char.name}">
            </div>
            <div class="starter-name">${char.name}</div>
        `;
        card.onclick = () => selectStarter(char.id);
        grid.appendChild(card);
    });

    document.getElementById('starter-screen').classList.remove('hidden');
}

function selectStarter(id) {
    selectedStarterId = id;
    document.querySelectorAll('.starter-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.id === id);
    });
    document.getElementById('starter-confirm-btn').disabled = false;
}

async function confirmStarter() {
    if (!selectedStarterId) return;

    const btn = document.getElementById('starter-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';

    try {
        const res = await fetch('/api/character/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ character_id: selectedStarterId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'حدث خطأ');

        const char = charactersData.find(c => c.id === selectedStarterId);
        if (char) {
            playerData.selectedCharacter = char.id;
            playerData.characterName = char.name;
            playerData.characterImage = char.image || null;
            playerData.characterAvatar = char.cardImage || char.image || null;
            playerData.characterPassives = char.passives || [];
            if (!char.unlocked) char.unlocked = true;
        }

        document.getElementById('starter-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');

        if (typeof updateLobbyUI === 'function') updateLobbyUI();

    } catch (e) {
        alert(e.message);
        btn.disabled = false;
        btn.textContent = 'ابدأ الرحلة';
    }
}
// ==========================================
// فحص عند الدخول
// ==========================================
async function checkStarterSelection() {
    try {
        const res = await fetch('/api/character/current');
        const data = await res.json();

        if (!data.selected_character) {
            openStarterScreen();
        }
    } catch (e) {
        console.error('فشل فحص الشخصية:', e);
    }
}

document.getElementById('starter-confirm-btn').onclick = confirmStarter;

checkStarterSelection();

// ==========================================
// 🏠 غرف الأصدقاء
// ==========================================

let currentRoom = null;
let activeInvite = null;
let roomPollInterval = null;

// ----------------------------------------
// إنشاء غرفة
// ----------------------------------------
async function createFriendsRoom(mode, teamIdx = null) {
    try {
        serverGameInProgress = false;

        const body = { mode };
        if (teamIdx !== null && teamIdx !== undefined) body.team_idx = teamIdx;

        const res = await apiCall('/api/rooms/create', 'POST', body);
        currentRoom = res.room;

        socket.emit('join_room', { room_id: currentRoom.id });

        showRoomScreen();
        startRoomPolling();
    } catch (e) {
        alert(e.message);
        document.getElementById('mode-screen').classList.remove('hidden');
    }
}
// ----------------------------------------
// عرض شاشة الغرفة
// ----------------------------------------
function showRoomScreen() {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('play-type-screen').classList.add('hidden');
    document.getElementById('mode-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('room-screen').classList.remove('hidden');
    renderRoom();
    loadInvitableFriends();
}
// ==========================================
// قائمة الأصدقاء للدعوة
// ==========================================
async function loadInvitableFriends() {
    const listEl = document.getElementById('room-friends-list');
    if (!listEl) return;

    listEl.innerHTML = '<p style="color:#888; text-align:center;">جاري التحميل...</p>';

    try {
        const data = await apiCall('/api/friends');
        listEl.innerHTML = '';

        if (!data.friends || data.friends.length === 0) {
            listEl.innerHTML = '<p style="color:#888; text-align:center;">لا يوجد أصدقاء بعد.</p>';
            return;
        }

        const pendingIds = (currentRoom.pending_invites || []).map(i => i.receiver.id);
        const memberIds = currentRoom.members.map(m => m.id);

        data.friends.forEach(f => {
            const item = document.createElement('div');
            item.className = 'room-friend-item';

            const isMember = memberIds.includes(f.id);
            const isPending = pendingIds.includes(f.id);
            const isOffline = f.status !== 'online';
            const isBusy = f.in_match;

            let statusText = 'متصل';
            let statusClass = '';
            if (isOffline) { statusText = 'غير متصل'; statusClass = 'offline'; }
            else if (isBusy) { statusText = 'في مباراة'; statusClass = 'busy'; }

            let btnHTML = '';
            if (isMember) {
                btnHTML = `<button class="room-invite-btn" disabled>في الغرفة</button>`;
            } else if (isPending) {
                btnHTML = `<button class="room-invite-btn" disabled>تمت الدعوة</button>`;
            } else if (isOffline || isBusy) {
                btnHTML = `<button class="room-invite-btn" disabled>غير متاح</button>`;
            } else {
                btnHTML = `<button class="room-invite-btn" data-invite="${f.id}">دعوة</button>`;
            }

            item.innerHTML = `
                <div class="room-friend-avatar">${f.username[0]}</div>
                <div class="room-friend-info">
                    <div class="room-friend-name">${f.username}</div>
                    <div class="room-friend-status ${statusClass}">${statusText}</div>
                </div>
                ${btnHTML}
            `;
            listEl.appendChild(item);
        });

        listEl.querySelectorAll('[data-invite]').forEach(btn => {
            btn.onclick = () => sendRoomInvite(btn.dataset.invite);
        });

    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<p style="color:#f66; text-align:center;">فشل تحميل الأصدقاء.</p>';
    }
}
// ==========================================
// إرسال دعوة
// ==========================================
async function sendRoomInvite(friendId) {
    try {
        await apiCall('/api/rooms/invite', 'POST', { receiver_id: parseInt(friendId) });
        setMessage('✅ تم إرسال الدعوة');
        loadInvitableFriends();
    } catch (e) {
        alert(e.message);
    }
}

// ==========================================
// طرد عضو (مضيف فقط)
// ==========================================
async function kickRoomPlayer(playerId) {
    if (!confirm('هل تريد طرد هذا اللاعب؟')) return;
    try {
        await apiCall(`/api/rooms/kick/${playerId}`, 'POST');
        pollRoomUpdates();
    } catch (e) {
        alert(e.message);
    }
}
function hideRoomScreen() {
    document.getElementById('room-screen').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
}

// ----------------------------------------
// رسم أعضاء الغرفة
// ----------------------------------------
function renderRoom() {
    if (!currentRoom) return;

    document.getElementById('room-mode').textContent = currentRoom.mode;
    document.getElementById('room-count').textContent =
        `${currentRoom.members_count}/${currentRoom.capacity}`;

    const membersEl = document.getElementById('room-members');
    membersEl.innerHTML = '';

    const isHost = (currentRoom.host_id === playerData.userId);
    const is2v2 = (currentRoom.mode === '2v2');

    const buildMemberCard = (m) => {
        const card = document.createElement('div');
        card.className = 'room-member-card'
            + (m.is_host ? ' host' : '')
            + (m.is_bot ? ' bot' : '');
        card.innerHTML = `
            ${m.is_host ? '<div class="room-member-badge">مضيف</div>' : ''}
            ${m.is_bot ? '<div class="room-member-badge bot-badge">🤖 بوت</div>' : ''}
            ${(!m.is_host && isHost) ?
                `<button class="room-member-kick" data-kick="${m.id}" title="طرد">✕</button>` : ''}
            <div class="room-member-avatar">${m.is_bot ? '🤖' : m.username[0]}</div>
            <div class="room-member-name">${m.username}</div>
        `;
        return card;
    };

    const buildEmptySlot = (teamIdx) => {
        const slot = document.createElement('div');
        slot.className = 'room-member-card empty-slot'
            + (teamIdx === 0 ? ' team-a-slot' : '')
            + (teamIdx === 1 ? ' team-b-slot' : '');

        if (isHost) {
            slot.innerHTML = `
                <div class="room-member-avatar">+</div>
                <div class="room-member-name">ضيف بوت</div>
            `;
            slot.onclick = () => addBotToSlot(teamIdx);
        } else {
            slot.innerHTML = `
                <div class="room-member-avatar">?</div>
                <div class="room-member-name">بانتظار لاعب</div>
            `;
        }
        return slot;
    };

    if (is2v2) {
        const teamA_members = currentRoom.members.filter(m => m.team_idx === 0);
        const teamB_members = currentRoom.members.filter(m => m.team_idx === 1);

        const container = document.createElement('div');
        container.className = 'room-teams-container';

        const colA = document.createElement('div');
        colA.className = 'room-team-column team-a';
        colA.innerHTML = `<div class="room-team-title">🔵 الفريق الأول</div>`;
        const listA = document.createElement('div');
        listA.className = 'room-team-list';
        teamA_members.forEach(m => listA.appendChild(buildMemberCard(m)));
        for (let i = teamA_members.length; i < 2; i++) listA.appendChild(buildEmptySlot(0));
        colA.appendChild(listA);
        container.appendChild(colA);

        const colB = document.createElement('div');
        colB.className = 'room-team-column team-b';
        colB.innerHTML = `<div class="room-team-title">🔴 الفريق الثاني</div>`;
        const listB = document.createElement('div');
        listB.className = 'room-team-list';
        teamB_members.forEach(m => listB.appendChild(buildMemberCard(m)));
        for (let i = teamB_members.length; i < 2; i++) listB.appendChild(buildEmptySlot(1));
        colB.appendChild(listB);
        container.appendChild(colB);

        membersEl.appendChild(container);

        if (isHost) {
            const bots = currentRoom.members.filter(m => m.is_bot);
            if (bots.length > 0) {
                const controls = document.createElement('div');
                controls.style.cssText = `
                    display: flex; gap: 8px; flex-wrap: wrap;
                    justify-content: center; margin-top: 12px;
                    padding: 10px; background: rgba(255,216,77,0.05);
                    border-radius: 10px; border: 1px dashed rgba(255,216,77,0.3);
                    width: 100%; grid-column: 1 / -1;
                `;
                controls.innerHTML = `<div style="color:#FFD84D; font-size:12px; font-weight:900; width:100%; text-align:center; margin-bottom:6px;">🤖 إدارة البوتات</div>`;

                bots.forEach(b => {
                    const btn = document.createElement('button');
                    btn.style.cssText = `
                        padding: 6px 12px; font-size: 11px; cursor: pointer;
                        background: linear-gradient(135deg, #ff6b6b, #aa1e1e);
                        color: #fff; font-weight: 900; border: none;
                        border-radius: 8px; font-family: inherit;
                    `;
                    btn.textContent = `🗑️ ${b.username} (${b.team_idx === 0 ? '🔵' : '🔴'})`;
                    btn.onclick = async () => {
                        if (!confirm(`إزالة ${b.username}؟`)) return;
                        try {
                            await apiCall('/api/rooms/remove_bot', 'POST',
                                { bot_index: b.bot_index });
                        } catch (e) { alert(e.message); }
                    };
                    controls.appendChild(btn);
                });
                membersEl.appendChild(controls);
            }
        }
    } else {
        currentRoom.members.forEach(m => membersEl.appendChild(buildMemberCard(m)));

        const emptySlots = currentRoom.capacity - currentRoom.members_count;
        for (let i = 0; i < emptySlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'room-member-card empty';
            if (isHost) {
                slot.style.cursor = 'pointer';
                slot.innerHTML = `<div class="room-member-avatar">+</div>
                                  <div class="room-member-name">ضيف بوت</div>`;
                slot.onclick = () => addBotToSlot(null);
            } else {
                slot.innerHTML = `<div class="room-member-avatar">?</div>
                                  <div class="room-member-name">بانتظار لاعب</div>`;
            }
            membersEl.appendChild(slot);
        }
    }

    membersEl.querySelectorAll('[data-kick]').forEach(btn => {
        btn.onclick = () => kickRoomPlayer(btn.dataset.kick);
    });

    const startBtn = document.getElementById('room-start-btn');
    const isReady = currentRoom.members_count === currentRoom.capacity;
    startBtn.disabled = !(isHost && isReady);
    startBtn.textContent = isHost
        ? (isReady
            ? '🎮 ابدأ اللعبة'
            : `في انتظار اللاعبين/البوتات (${currentRoom.members_count}/${currentRoom.capacity})`)
        : 'في انتظار المضيف ليبدأ...';
}

async function addBotToSlot(teamIdx) {
    try {
        const body = {};
        if (teamIdx !== null && teamIdx !== undefined) body.team_idx = teamIdx;
        await apiCall('/api/rooms/add_bot', 'POST', body);
    } catch (e) {
        alert(e.message);
    }
}
// ----------------------------------------
// زر البدء
// ----------------------------------------
document.getElementById('room-start-btn').onclick = async () => {
    try {
        await apiCall('/api/rooms/start', 'POST');
        socket.emit('game:start', { room_id: currentRoom.id });
    } catch (e) {
        alert(e.message);
    }
};
document.getElementById('room-leave-btn').onclick = async () => {
    if (!confirm('هل تريد مغادرة الغرفة؟')) return;
    try {
        const roomId = currentRoom ? currentRoom.id : null;
        await apiCall('/api/rooms/leave', 'POST');
        if (roomId) socket.emit('leave_room', { room_id: roomId });
        currentRoom = null;
        serverGameInProgress = false;
        hideRoomScreen();
    } catch (e) {
        alert(e.message);
    }
};
// ----------------------------------------
// Polling — التحديثات (احتياطي كل 15 ثانية)
// ----------------------------------------
function startRoomPolling() {
    if (roomPollInterval) return;
    roomPollInterval = setInterval(pollRoomUpdates, 15000);
    pollRoomUpdates();
}

async function pollRoomUpdates() {
    try {
        const data = await apiCall('/api/rooms/notifications');

        if (data.room) {
            currentRoom = data.room;
            const roomScreen = document.getElementById('room-screen');
            const gameScreen = document.getElementById('game-screen');

            if (gameScreen.classList.contains('hidden')) {
                if (roomScreen.classList.contains('hidden')) {
                    showRoomScreen();
                } else {
                    renderRoom();
                }
            }
        }
        if (data.invites.length > 0 && !currentRoom) {
            showInviteNotification(data.invites[0]);
        } else {
            hideInviteNotification();
        }

    } catch (e) {
        // silent
    }
}

// ----------------------------------------
// إشعار الدعوة
// ----------------------------------------
function showInviteNotification(invite) {
    if (!invite) return;
    if (activeInvite && activeInvite.invite_id === invite.invite_id) return;
    activeInvite = invite;

    const hostName = (invite.host && invite.host.username) ? invite.host.username : 'لاعب';
    const modeLabel = invite.mode || '-';
    const count = invite.members_count !== undefined && invite.capacity !== undefined
        ? `${invite.members_count}/${invite.capacity}`
        : '-';

    document.getElementById('invite-host-name').textContent = hostName;
    document.getElementById('invite-mode').textContent = modeLabel;
    document.getElementById('invite-count').textContent = count;

    document.getElementById('invite-notification').classList.remove('hidden');
}

async function respondToInvite(inviteId, accept, teamIdx) {
    try {
        const body = { invite_id: inviteId, accept };
        if (teamIdx !== null && teamIdx !== undefined) {
            body.team_idx = parseInt(teamIdx);
        }

        console.log('📤 respondToInvite:', body);

        const res = await apiCall('/api/rooms/respond', 'POST', body);
        console.log('📥 respondToInvite response:', res);

        hideInviteNotification();
        currentRoom = res.room;

        socket.emit('join_room', { room_id: currentRoom.id });

        showRoomScreen();
        startRoomPolling();
    } catch (e) {
        console.error('❌ respondToInvite error:', e);
        alert(e.message);
        hideInviteNotification();
    }
}


// ✅ مودال اختيار الفريق
function showInviteTeamModal(invite) {
    const modal = document.getElementById('invite-team-modal');

    if (!modal) {
        console.warn('⚠️ invite-team-modal not found, using auto-assign');
        respondToInvite(invite.invite_id, true, null);
        return;
    }

    modal.classList.remove('hidden');

    document.getElementById('invite-notification').classList.add('hidden');

    modal.querySelectorAll('.invite-team-btn').forEach(btn => {
        btn.onclick = async () => {
            const teamIdx = parseInt(btn.dataset.team);
            console.log('🎯 team selected:', teamIdx);
            modal.classList.add('hidden');
            await respondToInvite(invite.invite_id, true, teamIdx);
        };
    });

    document.getElementById('invite-team-cancel-btn').onclick = () => {
        modal.classList.add('hidden');
        if (activeInvite) {
            document.getElementById('invite-notification').classList.remove('hidden');
        }
    };
}
// ✅ استبدل مستمع زر القبول
document.getElementById('invite-accept-btn').onclick = async () => {
    if (!activeInvite) return;

    if (activeInvite.mode === '2v2') {
        showInviteTeamModal(activeInvite);
        return;
    }

    await respondToInvite(activeInvite.invite_id, true, null);
};


function hideInviteNotification() {
    if (!activeInvite) return;
    activeInvite = null;
    document.getElementById('invite-notification').classList.add('hidden');
}


document.getElementById('invite-reject-btn').onclick = async () => {
    if (!activeInvite) return;
    try {
        await apiCall('/api/rooms/respond', 'POST', {
            invite_id: activeInvite.invite_id,
            accept: false
        });
    } catch (e) {
        console.error(e);
    }
    hideInviteNotification();
};

// ==========================================
// ابدأ الـ polling لما الصفحة تحمّل
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (playerData.name && playerData.name !== 'لاعب') {
            startRoomPolling();
        }
    }, 1500);
});
// ---------- Airport Dialog ----------
function showServerAirportDialog(player) {
    const old = document.getElementById("airport-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "airport-overlay";
    overlay.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        z-index: 500; background: linear-gradient(145deg, #1a1330, #0d0919);
        border: 3px solid #789bc0; border-radius: 18px; padding: 15px 25px;
        text-align: center; color: #fff; font-family: Arial, sans-serif;
        box-shadow: 0 0 40px rgba(120,155,192,0.7);
        max-width: 90vw; direction: rtl;
    `;
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: 900; color: #789bc0; margin-bottom: 6px;">✈️ بوابة العالم</div>
        <div style="font-size: 14px; color: #ccc;">اضغط على أي خانة للانتقال إليها</div>
    `;
    document.body.appendChild(overlay);

    tileElements.forEach((el, index) => {
        if (index === 16) return;
        el.classList.add("airport-selectable");
        const handler = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (overlay.parentNode) overlay.remove();
            tileElements.forEach(t => {
                t.classList.remove("airport-selectable");
                t.onclick = null;
            });
            socket.emit('game:airport_choice', { room_id: currentRoom.id, tile_index: index });
        };
        el.onclick = handler;
    });
}

// ---------- Double Rent Dialog ----------
function showServerDoubleRentDialog(player, ownedIndices) {
    const old = document.getElementById("double-rent-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "double-rent-overlay";
    overlay.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        z-index: 500; background: linear-gradient(145deg, #2a1330, #1a0919);
        border: 3px solid #BA68C8; border-radius: 18px; padding: 15px 25px;
        text-align: center; color: #fff; font-family: Arial, sans-serif;
        box-shadow: 0 0 40px rgba(186,104,200,0.7);
        max-width: 90vw; direction: rtl;
    `;
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: 900; color: #E1BEE7; margin-bottom: 6px;">🚀 مضاعفة الأرباح</div>
        <div style="font-size: 14px; color: #ccc;">اضغط على أحد عقاراتك لمضاعفة إيجاره</div>
    `;
    document.body.appendChild(overlay);

    tileElements.forEach((el, index) => {
        if (!ownedIndices.includes(index)) return;
        el.classList.add("double-rent-selectable");
        const handler = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (overlay.parentNode) overlay.remove();
            tileElements.forEach(t => {
                t.classList.remove("double-rent-selectable");
                t.onclick = null;
            });
            socket.emit('game:double_rent_choice', { room_id: currentRoom.id, tile_index: index });
        };
        el.onclick = handler;
    });
}
// ==========================================
// 📋 Kiro "لدي خطة" Dialog
// ==========================================
function showServerPlanDialog(player, card) {
    const old = document.getElementById("plan-choice-dialog");
    if (old) old.remove();

    const dialog = document.createElement("div");
    dialog.id = "plan-choice-dialog";
    dialog.style.cssText = `
        position: fixed; inset: 0; z-index: 9999999;
        background: rgba(0,0,0,0.9);
        display: flex; align-items: center; justify-content: center;
        padding: 20px; direction: rtl; font-family: Arial, sans-serif;
    `;

    dialog.innerHTML = `
        <div style="background: linear-gradient(145deg, #1a1330, #0d0919); border: 3px solid #4a9fe8; border-radius: 22px; padding: 26px 30px; min-width: 300px; max-width: 440px; width: 100%; text-align: center; color: #fff; box-shadow: 0 0 60px rgba(74,159,232,0.6);">
            <div style="font-size: 24px; font-weight: 900; color: #4a9fe8; margin-bottom: 6px;">📋 لدي خطة</div>
            <div style="font-size: 14px; color: #b9adca; margin-bottom: 18px;">هل تريد استخدام المهارة؟</div>
            <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">البطاقة المسحوبة:</div>
            <div style="padding: 16px 18px; background: rgba(255,216,77,0.1); border: 2px dashed rgba(255,216,77,0.5); border-radius: 14px; font-size: 16px; font-weight: 700; color: #ffd84d; margin-bottom: 18px;">
                "${card.text}"
            </div>
            <div style="font-size: 13px; color: #888; margin-bottom: 20px; line-height: 1.5;">
                🔄 تجاهل هذه البطاقة وسحب أخرى<br>
                ⚠️ متاح مرة واحدة فقط في كل دور
            </div>
            <div style="display: flex; gap: 12px;">
                <button id="plan-accept-btn" type="button" style="flex: 1; padding: 14px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4dff88, #1eaa55); color: #0d0919; font-family: inherit;">✅ قبول البطاقة</button>
                <button id="plan-redraw-btn" type="button" style="flex: 1; padding: 14px; border: none; border-radius: 12px; font-size: 15px; font-weight: 900; cursor: pointer; background: linear-gradient(135deg, #4a9fe8, #2a6fb8); color: #fff; font-family: inherit;">🔄 تجاهل واسحب أخرى</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector("#plan-accept-btn").onclick = () => {
        dialog.remove();
        socket.emit('game:plan_choice', { room_id: currentRoom.id, accept: true });
    };
    dialog.querySelector("#plan-redraw-btn").onclick = () => {
        dialog.remove();
        socket.emit('game:plan_choice', { room_id: currentRoom.id, accept: false });
    };
}
function showServerFreeUpgradeDialog(player, ownedIndices) {
    const old = document.getElementById("free-upgrade-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "free-upgrade-overlay";
    overlay.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        z-index: 500; background: linear-gradient(145deg, #0f2a1a, #091912);
        border: 3px solid #4dff88; border-radius: 18px; padding: 15px 25px;
        text-align: center; color: #fff; font-family: Arial, sans-serif;
        box-shadow: 0 0 40px rgba(77,255,136,0.7);
        max-width: 90vw; direction: rtl;
    `;
    overlay.innerHTML = `
        <div style="font-size: 22px; font-weight: 900; color: #4dff88; margin-bottom: 6px;">🏠 ترقية مجانية</div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">اضغط على عقار من منازلك لترقيته</div>
        <div id="free-upgrade-timer" style="font-size: 22px; font-weight: 900; color: #ff4d4d;">15</div>
    `;
    document.body.appendChild(overlay);

    let picked = false;
    let remaining = 15;

    const cleanup = () => {
        const o = document.getElementById("free-upgrade-overlay");
        if (o) o.remove();
        if (timer) clearInterval(timer);
        tileElements.forEach(t => {
            t.classList.remove("free-upgrade-selectable");
            t.onclick = null;
        });
    };

    const select = (index) => {
        if (picked) return;
        picked = true;
        cleanup();
        socket.emit('game:free_upgrade_choice', { room_id: currentRoom.id, tile_index: index });
    };

    tileElements.forEach((el, index) => {
        if (!ownedIndices.includes(index)) return;
        el.classList.add("free-upgrade-selectable");
        el.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            select(index);
        };
    });

    const timerEl = document.getElementById("free-upgrade-timer");
    const timer = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = remaining;
        if (remaining <= 0) {
            if (ownedIndices.length > 0) select(ownedIndices[0]);
            else cleanup();
        }
    }, 1000);
}
// ==========================================
// 🎮 Offline (Local) Game Functions — للبوتات
// ==========================================

function performDiceRollLocal(player) {
    if (!player) return;
    if (!gameSession.active) return;
    if (gameSession.moving) return;
    if (player.alive === false) { nextTurn(); return; }

    stopTimer();
    gameSession.moving = true;
    gameSession.awaitingRoll = false;

    const rollBtn = document.getElementById("roll-dice-btn");
    if (rollBtn) rollBtn.disabled = true;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    let total = d1 + d2;

    if (player._diceDoubleNextTurn) {
        player._diceDoubleNextTurn = false;
        total = total * 2;
    }

    const el1 = document.getElementById("dice-one");
    const el2 = document.getElementById("dice-two");
    if (el1) el1.textContent = d1;
    if (el2) el2.textContent = d2;

    setMessage(`${player.name} رمى ${d1} + ${d2} = ${total}`);

    const isDouble = (d1 === d2);
    if (isDouble) gameSession.consecutiveDoubles++;
    else gameSession.consecutiveDoubles = 0;

    if (gameSession.consecutiveDoubles >= 3) {
        gameSession.consecutiveDoubles = 0;
        setTimeout(() => goToJail(player), 700);
        return;
    }

    movePlayerLocal(player, total, isDouble);
}

function movePlayerLocal(player, steps, isDouble) {
    saveLastRoll(player, player.position, steps);
    let moved = 0;
    let passedStart = false;

    const step = () => {
        if (moved >= steps) {
            if (player.position === 0 && !passedStart) {
                handleLandingLocal(player, isDouble);
            } else {
                handleLandingLocal(player, isDouble);
            }
            return;
        }
        moved++;
        const oldPos = player.position;
        player.position = (player.position + 1) % boardTiles.length;

        if (player.position === 0 && oldPos !== 0 && moved < steps) {
            passedStart = true;
            updateToken(player); updateActiveToken();
            transferMoney(null, player.id, 250, null);
            setTimeout(step, 280);
            return;
        }
        updateToken(player); updateActiveToken();
        setTimeout(step, 280);
    };
    step();
}

function handleLandingLocal(player, isDouble) {
    gameSession.moving = false;
    if (player.money <= 0) { handleBankruptcy(player); return; }

    const tile = boardTiles[player.position];

    if (tile.type === "start") {
        setMessage(`${player.name} وصل إلى البداية`);

        const houses = boardTiles.filter(t =>
            t.owner === player.id && t.type === "property" && t.level === "house"
        );

        if (houses.length === 0) {
            finishLandingLocal(player, isDouble);
            return;
        }

        if (player.human) {
            startFreeUpgradeSelection(player, houses, isDouble);
        } else {
            const best = houses[0];
            const idx = boardTiles.indexOf(best);
            best.level = "building";
            updateTileVisual(idx);
            updatePlayersDisplay();
            setMessage(`${player.name} طوّر ${best.name} مجاناً`);
            setTimeout(() => finishLandingLocal(player, isDouble), 1200);
        }
        return;
    }

    if (tile.type === "tip") {
        transferMoney(null, player.id, tile.amount, () => finishLandingLocal(player, isDouble));
        return;
    }

    if (tile.type === "chest") {
        const reward = Math.floor(Math.random() * (500 - 75 + 1)) + 75;
        transferMoney(null, player.id, reward, () => finishLandingLocal(player, isDouble));
        return;
    }

    if (tile.type === "chance") {
        executeChanceCard(player, isDouble);
        return;
    }

    if (tile.type === "jail") {
        player.jailTurns = 2;
        updatePlayersDisplay();
        showEventCard("توقف", "المحطة السوداء!", `${player.name} دخل المحطة\nسيتخطى دورين`,
            "#3a3a42", () => finishLandingLocal(player, isDouble));
        return;
    }

    if (tile.type === "airport") {
        setMessage(`${player.name} وصل لبوابة العالم`);
        player.airportPending = false;

        if (player.human) {
            startAirportSelection(player);
        } else {
            let bestIndex = 1;
            for (let i = 0; i < boardTiles.length; i++) {
                if (i === 16) continue;
                const t = boardTiles[i];
                if (t.type === "property" && t.owner === null) {
                    bestIndex = i;
                    break;
                }
            }
            walkPlayerToTile(player, bestIndex, () => {
                gameSession.moving = false;
                handleLandingLocal(player, isDouble);
            });
        }
        return;
    }

    if (tile.type === "double_rent") {
        const owned = boardTiles.filter(t => t.type === "property" && t.owner === player.id);
        if (owned.length === 0) {
            setMessage(`${player.name} لا يملك عقارات`);
            finishLandingLocal(player, isDouble);
            return;
        }
        if (player.human) {
            startDoubleRentSelection(player, isDouble);
        } else {
            let best = owned[0], bestR = getRentByLevel(best);
            owned.forEach(p => { const r = getRentByLevel(p); if (r > bestR) { best = p; bestR = r; } });
            applyDoubleRent(player, best, isDouble);
        }
        return;
    }

    if (tile.type === "property" || tile.type === "station") {

        if (tile.owner === null) {
            if (player.human) {
                showBuyDialog(player, tile, isDouble);
            } else {
                if (player.money >= tile.price + 200) {
                    buyPropertyLocal(player, tile, isDouble);
                } else {
                    setMessage(`${player.name} تخطى ${tile.name}`);
                    finishLandingLocal(player, isDouble);
                }
            }
            return;
        }

        if (tile.owner === player.id) {
            if (tile.type === "property" && tile.level === "house") {
                if (player.human) {
                    showUpgradeDialog(player, tile, isDouble);
                } else {
                    const up = getUpgradePrice(tile);
                    if (player.money >= up + 300) {
                        upgradePropertyLocal(player, tile, isDouble);
                    } else {
                        setMessage(`${player.name} مر على ${tile.name}`);
                        finishLandingLocal(player, isDouble);
                    }
                }
                return;
            }
            setMessage(`${player.name} مر على ${tile.name}`);
            finishLandingLocal(player, isDouble);
            return;
        }

        const owner = players[tile.owner];
        const rent = getRentByLevel(tile);

        setMessage(`${player.name} دفع ${rent}$ إيجار لـ ${owner.name}`);

        const wasHumanKiro = (player.human && playerData.selectedCharacter === "kiro");

        transferMoney(player.id, owner.id, rent, () => {
            if (wasHumanKiro && !player._reboundInProgress) {
                const roll = Math.floor(Math.random() * 100) + 1;
                if (roll <= 70) {
                    const refund = Math.floor(rent * 0.7);
                    player._reboundInProgress = true;
                    setTimeout(() => {
                        showPassiveActivation(player.id, "🔄", "الارتداد");
                        setTimeout(() => {
                            transferMoney(null, player.id, refund, () => {
                                setMessage(`🔄 الارتداد: استرد كيرو ${refund}$`);
                                player._reboundInProgress = false;
                            });
                        }, 600);
                    }, 400);
                }
            }

            if (player.money <= 0) { handleBankruptcy(player); return; }

            if (tile.type === "property" && tile.level === "house") {
                const stealPrice = getStealPrice(tile);
                if (player.money >= stealPrice) {
                    if (player.human) {
                        showStealDialog(player, tile, owner, rent, isDouble);
                        return;
                    } else {
                        if (player.money >= stealPrice + 300) {
                            const index = boardTiles.indexOf(tile);
                            transferMoney(player.id, owner.id, stealPrice, () => {
                                tile.owner = player.id;
                                tile.rentMultiplier = 1;
                                updatePlayersDisplay();
                                updateTileVisual(index);
                                if (checkWinConditions()) return;
                                finishLandingLocal(player, isDouble);
                            });
                            return;
                        }
                    }
                }
            }

            finishLandingLocal(player, isDouble);
        });
        return;
    }

    setMessage(`${player.name} وصل إلى ${tile.name}`);
    finishLandingLocal(player, isDouble);
}
function buyPropertyLocal(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    transferMoney(player.id, null, tile.price, () => {
        tile.owner = player.id;
        tile.level = (tile.type === "station") ? null : "house";
        if (tile.type === "property") tile.rentMultiplier = 1;
        updatePlayersDisplay(); updateTileVisual(index);
        setMessage(`${player.name} اشترى ${tile.name}`);
        if (player.money <= 0) { handleBankruptcy(player); return; }
        finishLandingLocal(player, isDouble);
    });
}

function upgradePropertyLocal(player, tile, isDouble) {
    const index = boardTiles.indexOf(tile);
    const price = getUpgradePrice(tile);
    transferMoney(player.id, null, price, () => {
        tile.level = "building";
        updatePlayersDisplay(); updateTileVisual(index);
        setMessage(`${player.name} طوّر ${tile.name}`);
        if (player.money <= 0) { handleBankruptcy(player); return; }
        finishLandingLocal(player, isDouble);
    });
}

function finishLandingLocal(player, isDouble) {
    updatePlayersDisplay();
    updateActiveToken();

    if (isDouble) {
        setTimeout(() => {
            if (gameSession.active) {
                gameSession.moving = false;
                gameSession.awaitingRoll = true;

                const rollBtn = document.getElementById("roll-dice-btn");
                if (rollBtn && player.human) {
                    rollBtn.disabled = false;
                }

                const current = players[gameSession.currentPlayer];
                if (current && !current.human) {
                    setTimeout(() => {
                        if (gameSession.active && !gameSession.moving) {
                            performDiceRollLocal(current);
                        }
                    }, 1200);
                }
            }
        }, 1000);
        return;
    }

    setTimeout(() => {
        if (gameSession.active) {
            gameSession.moving = false;
            nextTurn();
        }
    }, 1000);
}
// ==========================================
// ⏱️ Timer Display
// ==========================================

function updateGameTimer(remaining, total) {
    // ✅ حط المؤقت جوه .map-center
    const center = document.querySelector('.map-center');
    if (!center) {
        console.warn('map-center not found — timer will be skipped');
        return;
    }

    let el = document.getElementById('game-timer-badge');
    if (!el) {
        el = document.createElement('div');
        el.id = 'game-timer-badge';
        el.style.cssText = `
            margin-bottom: 6px;
            padding: 5px 14px;
            border-radius: 10px;
            background: linear-gradient(135deg, #1a1330, #0d0919);
            border: 2px solid #ffd84d;
            color: #ffd84d;
            font-size: 16px;
            font-weight: 900;
            font-family: 'Courier New', monospace;
            box-shadow: 0 0 15px rgba(255, 216, 77, 0.6), 0 3px 8px rgba(0,0,0,0.5);
            direction: ltr;
            min-width: 75px;
            text-align: center;
            pointer-events: none;
            z-index: 10;
        `;
        // ✅ ضيفه في أول .map-center (فوق النرد)
        center.insertBefore(el, center.firstChild);
    }

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    el.textContent = `⏱ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (remaining <= 60) {
        el.style.borderColor = '#ff4d4d';
        el.style.color = '#ff4d4d';
        el.style.boxShadow = '0 0 20px rgba(255, 77, 77, 0.9), 0 3px 8px rgba(0,0,0,0.5)';
    } else if (remaining <= 300) {
        el.style.borderColor = '#ff9800';
        el.style.color = '#ff9800';
        el.style.boxShadow = '0 0 18px rgba(255, 152, 0, 0.7), 0 3px 8px rgba(0,0,0,0.5)';
    } else {
        el.style.borderColor = '#ffd84d';
        el.style.color = '#ffd84d';
        el.style.boxShadow = '0 0 15px rgba(255, 216, 77, 0.6), 0 3px 8px rgba(0,0,0,0.5)';
    }
}
function removeGameTimer() {
    const el = document.getElementById('game-timer-badge');
    if (el) el.remove();
}


// ==========================================
// 💬 Chat + 🏳️ Surrender
// ==========================================

const chatState = {
    open: false,
    messages: [],
};

function ensureChatUI() {
    if (document.getElementById('game-chat-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'game-chat-btn';
    btn.type = 'button';
    btn.innerHTML = '💬';
    btn.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4a9fe8, #2a6fb8);
        color: #fff;
        font-size: 26px;
        font-weight: 900;
        border: 3px solid #fff;
        cursor: pointer;
        z-index: 99998;
        box-shadow: 0 0 25px rgba(74, 159, 232, 0.8), 0 4px 12px rgba(0,0,0,0.5);
        transition: transform 0.2s ease;
    `;
    btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    btn.onclick = toggleChatPanel;
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'game-chat-panel';
    panel.style.cssText = `
        position: fixed;
        bottom: 160px;
        right: 20px;
        width: 340px;
        height: 460px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 200px);
        background: linear-gradient(180deg, #1a1330 0%, #0d0919 100%);
        border: 3px solid #4a9fe8;
        border-radius: 18px;
        box-shadow: 0 0 40px rgba(74, 159, 232, 0.5), 0 15px 40px rgba(0,0,0,0.9);
        display: none;
        flex-direction: column;
        z-index: 99998;
        overflow: hidden;
        direction: rtl;
        font-family: Arial, sans-serif;
    `;
    panel.innerHTML = `
        <div style="
            padding: 10px 14px;
            background: linear-gradient(135deg, #2a1540, #150820);
            border-bottom: 2px solid #4a9fe8;
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div style="color:#ffd84d; font-size:16px; font-weight:900;">💬 دردشة الغرفة</div>
            <div style="display:flex; gap:6px; align-items:center;">
                <button id="chat-surrender-btn" type="button" title="انسحاب" style="
                    padding: 4px 10px;
                    background: linear-gradient(135deg, #ff6b6b, #aa1e1e);
                    color: #fff;
                    border: 2px solid #fff;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 900;
                    cursor: pointer;
                    font-family: inherit;
                ">🏳️ انسحاب</button>
                <button id="chat-close-btn" type="button" style="
                    width: 28px;
                    height: 28px;
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 50%;
                    font-size: 16px;
                    cursor: pointer;
                    display: grid;
                    place-items: center;
                    font-family: inherit;
                ">✕</button>
            </div>
        </div>
        <div id="chat-messages" style="
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(0,0,0,0.2);
        "></div>
        <div style="
            display: flex;
            gap: 6px;
            padding: 10px;
            background: rgba(0,0,0,0.3);
            border-top: 2px solid rgba(74,159,232,0.4);
        ">
            <input id="chat-input" type="text" maxlength="200" placeholder="اكتب رسالتك..." style="
                flex: 1;
                padding: 10px 12px;
                border-radius: 10px;
                border: 2px solid rgba(74,159,232,0.5);
                background: rgba(255,255,255,0.08);
                color: #fff;
                font-size: 14px;
                font-family: inherit;
                outline: none;
                direction: rtl;
            " />
            <button id="chat-send-btn" type="button" style="
                padding: 10px 16px;
                background: linear-gradient(135deg, #4a9fe8, #2a6fb8);
                color: #fff;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 900;
                cursor: pointer;
                font-family: inherit;
            ">إرسال</button>
        </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('chat-close-btn').onclick = toggleChatPanel;
    document.getElementById('chat-send-btn').onclick = sendChatMessage;
    document.getElementById('chat-surrender-btn').onclick = confirmSurrender;

    const input = document.getElementById('chat-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });

    chatState.messages.forEach(msg => renderChatMessage(msg));
}

function toggleChatPanel() {
    const panel = document.getElementById('game-chat-panel');
    if (!panel) return;

    chatState.open = !chatState.open;
    panel.style.display = chatState.open ? 'flex' : 'none';

    if (chatState.open) {
        // ✅ اطلب التاريخ
        if (currentRoom && currentRoom.id) {
            socket.emit('game:chat_history_request', { room_id: currentRoom.id });
        }
        const input = document.getElementById('chat-input');
        if (input) setTimeout(() => input.focus(), 100);
        const msgs = document.getElementById('chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (!currentRoom || !currentRoom.id) return;

    socket.emit('game:chat_send', {
        room_id: currentRoom.id,
        text: text,
    });

    input.value = '';
}

function appendChatMessage(data) {
    chatState.messages.push(data);
    if (chatState.messages.length > 100) chatState.messages.shift();
    if (chatState.open) renderChatMessage(data);
}

function renderChatMessage(data) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const myId = playerData.userId;
    const isMe = String(data.user_id) === String(myId);

    const time = new Date(data.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;

    const div = document.createElement('div');
    div.style.cssText = `
        padding: 8px 12px;
        border-radius: 12px;
        background: ${isMe
            ? 'linear-gradient(135deg, rgba(74,159,232,0.35), rgba(42,111,184,0.25))'
            : 'rgba(255,255,255,0.06)'};
        border: 1px solid ${isMe ? 'rgba(74,159,232,0.6)' : 'rgba(255,255,255,0.1)'};
        max-width: 85%;
        align-self: ${isMe ? 'flex-end' : 'flex-start'};
        word-wrap: break-word;
        overflow-wrap: break-word;
    `;
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:4px;">
            <span style="color:${isMe ? '#4a9fe8' : '#ffd84d'}; font-size:11px; font-weight:900;">
                ${isMe ? 'أنت' : escapeHtml(data.username)}
            </span>
            <span style="color:#888; font-size:10px;">${timeStr}</span>
        </div>
        <div style="color:#fff; font-size:13px; line-height:1.5;">${escapeHtml(data.text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function confirmSurrender() {
    if (!confirm('⚠️ هل أنت متأكد من الانسحاب؟\n\n• ستخرج من اللعبة فورًا\n• لن تستطيع الرجوع\n• ممتلكاتك ستتحرر')) {
        return;
    }
    if (!currentRoom || !currentRoom.id) return;

    socket.emit('game:surrender', {
        room_id: currentRoom.id,
    });

    const panel = document.getElementById('game-chat-panel');
    if (panel) panel.style.display = 'none';
    chatState.open = false;
}

function removeChatUI() {
    const btn = document.getElementById('game-chat-btn');
    const panel = document.getElementById('game-chat-panel');
    if (btn) btn.remove();
    if (panel) panel.remove();
    chatState.open = false;
    chatState.messages = [];
}
// ==========================================
// 💬 Chat Popups (زي إشعار الدعوة)
// ==========================================
function showChatPopup(data) {
    let container = document.getElementById('chat-popups-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'chat-popups-container';
        container.style.cssText = `
            position: fixed;
            bottom: 165px;
            right: 90px;
            z-index: 9500;
            display: flex;
            flex-direction: column-reverse;
            gap: 8px;
            pointer-events: none;
            max-width: 340px;
            align-items: flex-end;
        `;
                document.body.appendChild(container);
    }

    const isMe = String(data.user_id) === String(playerData.userId);
    const isSystem = data.is_system === true;

    // ✅ لو رسالة نظام → لون رمادي
    // ✅ لو رسالتي → أزرق
    // ✅ لو رسالة حد تاني → ذهبي
    let bg, borderColor, icon, nameColor, nameText;
    if (isSystem) {
        bg = 'linear-gradient(180deg, rgba(60,60,80,0.95), rgba(30,30,45,0.95))';
        borderColor = '#888';
        icon = '⚙️';
        nameColor = '#ccc';
        nameText = 'النظام';
    } else if (isMe) {
        bg = 'linear-gradient(180deg, rgba(74,159,232,0.95), rgba(42,111,184,0.95))';
        borderColor = '#4a9fe8';
        icon = '💬';
        nameColor = '#fff';
        nameText = 'أنت';
    } else {
        bg = 'linear-gradient(180deg, rgba(42,21,64,0.97), rgba(21,8,32,0.97))';
        borderColor = '#ffd84d';
        icon = '💬';
        nameColor = '#ffd84d';
        nameText = data.username;
    }

    const popup = document.createElement('div');
    popup.style.cssText = `
        padding: 10px 18px;
        border-radius: 16px;
        background: ${bg};
        border: 3px solid ${borderColor};
        color: #fff;
        font-size: 14px;
        font-family: Arial, sans-serif;
        box-shadow: 0 0 25px ${borderColor}80, 0 8px 20px rgba(0,0,0,0.8);
        direction: rtl;
        pointer-events: auto;
        max-width: 320px;
        min-width: 180px;
        word-wrap: break-word;
        text-align: right;
        animation: chatPopupIn 0.4s cubic-bezier(.34,1.56,.64,1);
        opacity: 1;
    `;
        popup.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span style="font-size:16px;">${icon}</span>
            <span style="color:${nameColor}; font-size:12px; font-weight:900;">
                ${escapeHtml(nameText)}
            </span>
        </div>
        <div style="font-size:14px; line-height:1.5;">${escapeHtml(data.text)}</div>
    `;

    container.appendChild(popup);

    // ✅ اختفاء بعد 4.5 ثانية
    setTimeout(() => {
        popup.style.transition = 'opacity 0.5s, transform 0.5s';
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(20px) scale(0.9)';
        setTimeout(() => popup.remove(), 500);
    }, 4500);

    // ✅ حد أقصى 5 popups على الشاشة
    const all = container.querySelectorAll('div');
    if (all.length > 5) {
        all[0].remove();
    }
}
// ==========================================
// 👑 Leader Check — Play Button
// ==========================================
function updatePlayButtonForLeader() {
    const playBtn = document.getElementById('play-btn');
    if (!playBtn) return;

    // ✅ لو مفيش party → شغال
    if (!currentParty || !currentParty.members || currentParty.members.length <= 1) {
        playBtn.disabled = false;
        playBtn.style.opacity = '1';
        playBtn.style.pointerEvents = 'auto';
        playBtn.title = '';
        return;
    }

    // ✅ في party → الليدر فقط
    const leader = currentParty.members[0];
    const isLeader = String(leader.id) === String(playerData.userId);

    if (isLeader) {
        playBtn.disabled = false;
        playBtn.style.opacity = '1';
        playBtn.style.pointerEvents = 'auto';
        playBtn.title = 'أنت القائد';
    } else {
        playBtn.disabled = true;
        playBtn.style.opacity = '0.5';
        playBtn.style.pointerEvents = 'none';
        playBtn.title = 'القائد فقط يمكنه بدء اللعب';
    }
}
// ==========================================
// 💬 Lobby Chat UI
// ==========================================
function ensureLobbyChatUI() {
    const btn = document.getElementById('lobby-chat-btn');
    const panel = document.getElementById('lobby-chat-panel');
    const closeBtn = document.getElementById('lobby-chat-close');
    const sendBtn = document.getElementById('lobby-chat-send');
    const input = document.getElementById('lobby-chat-input');

    if (btn && btn.dataset.bound !== '1') {
        btn.dataset.bound = '1';
        btn.addEventListener('click', toggleLobbyChatPanel);
        console.log('✅ lobby-chat-btn bound');
    }
    if (closeBtn && closeBtn.dataset.bound !== '1') {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', toggleLobbyChatPanel);
    }
    if (sendBtn && sendBtn.dataset.bound !== '1') {
        sendBtn.dataset.bound = '1';
        sendBtn.addEventListener('click', sendLobbyChatMessage);
    }
    if (input && input.dataset.bound !== '1') {
        input.dataset.bound = '1';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendLobbyChatMessage();
            }
        });
    }
}

function toggleLobbyChatPanel() {
    const panel = document.getElementById('lobby-chat-panel');
    if (!panel) return;

    lobbyChatState.open = !lobbyChatState.open;
    panel.classList.toggle('hidden', !lobbyChatState.open);
    panel.style.display = lobbyChatState.open ? 'flex' : 'none';

    if (lobbyChatState.open) {
        socket.emit('lobby:chat_history_request', {});
        const input = document.getElementById('lobby-chat-input');
        if (input) setTimeout(() => input.focus(), 100);
        const msgs = document.getElementById('lobby-chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
}

function sendLobbyChatMessage() {
    const input = document.getElementById('lobby-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (!currentParty) return;

    socket.emit('lobby:chat_send', { text });
    input.value = '';
}

function renderLobbyChatMessage(data) {
    const container = document.getElementById('lobby-chat-messages');
    if (!container) return;

    const myId = playerData.userId;
    const isMe = String(data.user_id) === String(myId);
    const isSystem = data.is_system === true;

    const time = new Date(data.timestamp);
    const timeStr = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;

    let bg, borderColor, nameColor, nameText;
    if (isSystem) {
        bg = 'rgba(60,60,80,0.5)';
        borderColor = 'rgba(136,136,136,0.5)';
        nameColor = '#ccc';
        nameText = 'النظام';
    } else if (isMe) {
        bg = 'linear-gradient(135deg, rgba(74,159,232,0.35), rgba(42,111,184,0.25))';
        borderColor = 'rgba(74,159,232,0.6)';
        nameColor = '#4a9fe8';
        nameText = 'أنت';
    } else {
        bg = 'rgba(255,255,255,0.06)';
        borderColor = 'rgba(255,255,255,0.1)';
        nameColor = '#ffd84d';
        nameText = data.username;
    }

    const div = document.createElement('div');
    div.style.cssText = `
        padding: 8px 12px;
        border-radius: 12px;
        background: ${bg};
        border: 1px solid ${borderColor};
        max-width: 85%;
        align-self: ${isMe ? 'flex-end' : 'flex-start'};
        word-wrap: break-word;
    `;
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:4px;">
            <span style="color:${nameColor}; font-size:11px; font-weight:900;">${escapeHtml(nameText)}</span>
            <span style="color:#888; font-size:10px;">${timeStr}</span>
        </div>
        <div style="color:#fff; font-size:13px; line-height:1.5;">${escapeHtml(data.text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
console.log("Milioner.js loaded — نظام الحسابات + الأدمن + 35 بطاقة حظ + Socket.IO + Matchmaking — Debug: Ctrl+Shift+D");