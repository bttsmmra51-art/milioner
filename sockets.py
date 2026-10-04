# sockets.py
from flask import request
from flask_login import current_user
from flask_socketio import join_room, leave_room, emit

from extensions import socketio, db
from game_state import create_game, get_game, remove_game, active_games, Player
from models import Room, RoomMember, User, Friendship, RoomInvite

import json
import random as _random
import threading
import time as _time
import traceback
from functools import wraps


# ==========================================
# 🛡️ Safe Event Decorator
# ==========================================

def safe_socket_event(fn):
    """ديكوريتر يلف كل socket event بـ try/except"""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            print(f'\n❌ [{fn.__name__}] ERROR: {type(e).__name__}: {e}')
            traceback.print_exc()
            try:
                emit('game:error', {
                    'error': 'حصل خطأ في السيرفر — جرب تاني',
                    'event': fn.__name__,
                })
            except Exception:
                pass
            return None
    return wrapper


# ==========================================
# Maps
# ==========================================
connected_users = {}
user_sockets = {}

# ✅ تتبع اللاعبين المنقطعين (للـ reconnect)
disconnected_users = {}          # user_id -> {"time", "room_id", "username"}
RECONNECT_GRACE_SECONDS = 30


# ==========================================
# 🏠 Lobby Parties
# ==========================================
lobby_parties = {}
lobby_pending = {}
_lobby_invite_counter = [0]


# ==========================================
# 💬 Chat Histories
# ==========================================
_chat_history = {}
_lobby_chat_history = {}


# ==========================================
# Helpers
# ==========================================
def emit_room_update(room_id, room_data):
    socketio.emit('room_update', {'room': room_data}, room=f'room_{room_id}')

def emit_room_closed(room_id):
    socketio.emit('room_closed', {}, room=f'room_{room_id}')

def emit_game_started(room_id, room_data):
    socketio.emit('game_started', {'room': room_data}, room=f'room_{room_id}')

def emit_invite_to_user(user_id, invite_data):
    sid = user_sockets.get(user_id)
    if sid:
        socketio.emit('invite_received', invite_data, to=sid)

def emit_invite_cancelled(user_id, invite_id):
    sid = user_sockets.get(user_id)
    if sid:
        socketio.emit('invite_cancelled', {'invite_id': invite_id}, to=sid)


def _broadcast_state(room_id):
    try:
        gs = get_game(room_id)
        if not gs:
            return
        socketio.emit('game:state', gs.to_dict(), room=f'room_{room_id}')
    except Exception as e:
        print(f'❌ _broadcast_state error: {e}')


def _emit_money_events(room_id, events):
    if not events:
        return
    try:
        socketio.emit('game:money_events', {"events": events}, room=f'room_{room_id}')
    except Exception as e:
        print(f'❌ _emit_money_events error: {e}')


def _emit_passive_triggers(room_id, triggers):
    if not triggers:
        return
    try:
        socketio.emit('game:passive_triggers', {"triggers": triggers}, room=f'room_{room_id}')
    except Exception as e:
        print(f'❌ _emit_passive_triggers error: {e}')


# ==========================================
# 🏠 Lobby Helpers
# ==========================================
def get_lobby_of_user(user_id):
    if user_id is None:
        return None
    if user_id in lobby_parties:
        return user_id
    for leader_uid, party in lobby_parties.items():
        if user_id in party["members"]:
            return leader_uid
    return None


def get_lobby_data(leader_uid):
    party = lobby_parties.get(leader_uid)
    if not party:
        return None

    members = []
    u = User.query.get(leader_uid)
    if u:
        char = "sama"
        try:
            if u.save and u.save.selected_character:
                char = u.save.selected_character
        except Exception:
            pass
        members.append({
            "id": u.id,
            "username": u.username,
            "level": u.level,
            "character": char,
            "is_leader": True,
        })

    for uid in party["members"]:
        u = User.query.get(uid)
        if not u:
            continue
        char = "sama"
        try:
            if u.save and u.save.selected_character:
                char = u.save.selected_character
        except Exception:
            pass
        members.append({
            "id": u.id,
            "username": u.username,
            "level": u.level,
            "character": char,
            "is_leader": False,
        })

    return {
        "leader_id": leader_uid,
        "members": members,
        "count": len(members),
    }


def broadcast_lobby_update(leader_uid):
    data = get_lobby_data(leader_uid)
    if not data:
        return
    for m in data["members"]:
        sid = user_sockets.get(m["id"])
        if sid:
            socketio.emit('lobby:party_update', {'party': data}, to=sid)


def broadcast_lobby_closed(leader_uid, reason="انتهت المجموعة"):
    party = lobby_parties.pop(leader_uid, None)
    if not party:
        return

    all_uids = [leader_uid] + list(party["members"])

    to_remove = []
    for inv_id, inv in list(lobby_pending.items()):
        if inv["from"] in all_uids or inv["to"] in all_uids:
            to_remove.append(inv_id)
    for inv_id in to_remove:
        lobby_pending.pop(inv_id, None)

    _lobby_chat_history.pop(leader_uid, None)

    for uid in all_uids:
        sid = user_sockets.get(uid)
        if sid:
            socketio.emit('lobby:closed', {'reason': reason}, to=sid)


def remove_from_lobby(user_id):
    leader_uid = get_lobby_of_user(user_id)
    if not leader_uid:
        return False

    if user_id == leader_uid:
        broadcast_lobby_closed(leader_uid, "القائد خرج")
        return True

    party = lobby_parties.get(leader_uid)
    if party and user_id in party["members"]:
        party["members"].remove(user_id)
        broadcast_lobby_update(leader_uid)
        return True
    return False


# ==========================================
# 💬 Lobby Chat Helpers
# ==========================================
def _lobby_all_uids(leader_uid):
    party = lobby_parties.get(leader_uid, {})
    return [leader_uid] + list(party.get('members', []))


def emit_lobby_chat_to_party(leader_uid, msg):
    for uid in _lobby_all_uids(leader_uid):
        sid = user_sockets.get(uid)
        if sid:
            socketio.emit('lobby:chat_message', msg, to=sid)


# ==========================================
# Connection
# ==========================================
@socketio.on('connect')
def handle_connect():
    if not current_user.is_authenticated:
        print('🚫 Socket connect rejected: not authenticated')
        return False

    user_id = current_user.id
    connected_users[request.sid] = user_id
    user_sockets[user_id] = request.sid
    print(f'✅ Socket connected: {current_user.username} (uid={user_id})')

    # ✅ هل ده reconnect لـ لعبة نشطة؟
    was_disconnected = user_id in disconnected_users
    if was_disconnected:
        info = disconnected_users.pop(user_id)
        room_id = info["room_id"]
        elapsed = _time.time() - info["time"]
        print(f'🔄 {current_user.username} reconnected to game {room_id} '
              f'(after {elapsed:.1f}s)')

        join_room(f'room_{room_id}')

        gs = get_game(room_id)
        if gs:
            emit_system_message(room_id, f"✅ {current_user.username} عاد للعبة")
            _broadcast_state(room_id)
        return

    try:
        member = (RoomMember.query
                  .join(Room)
                  .filter(RoomMember.player_id == user_id,
                          Room.status.in_(['waiting', 'playing']))
                  .first())
        if member:
            join_room(f'room_{member.room_id}')
            print(f'   ↳ auto-joined socket room_{member.room_id}')
    except Exception as e:
        print('   ⚠️ auto-join failed:', e)

    emit('connected', {'message': 'Connected to game server'})
    emit('user_info', {'user_id': user_id, 'username': current_user.username})

    leader_uid = get_lobby_of_user(user_id)
    if leader_uid:
        data = get_lobby_data(leader_uid)
        if data:
            emit('lobby:party_update', {'party': data})


@socketio.on('disconnect')
def handle_disconnect():
    uid = connected_users.pop(request.sid, None)
    if uid and user_sockets.get(uid) == request.sid:
        user_sockets.pop(uid, None)

    if uid:
        try:
            found_game = False
            for room_id, gs in list(active_games.items()):
                p = gs.get_player_by_user_id(uid)
                if p and p.alive:
                    disconnected_users[uid] = {
                        "time": _time.time(),
                        "room_id": room_id,
                        "username": p.username,
                    }
                    emit_system_message(
                        room_id,
                        f"⚠️ {p.username} انقطع اتصاله — عنده "
                        f"{RECONNECT_GRACE_SECONDS} ثانية للرجوع"
                    )
                    print(f'⚠️ {p.username} disconnected from game '
                          f'{room_id} — grace period started')
                    found_game = True
                    break

            if not found_game:
                remove_from_lobby(uid)
                _cleanup_waiting_rooms(uid)
        except Exception as e:
            print(f'⚠️ disconnect handling error: {e}')
            import traceback
            traceback.print_exc()
            try:
                remove_from_lobby(uid)
            except Exception:
                pass

    print(f'❌ Socket disconnected (sid={request.sid})')


# ==========================================
# Room events
# ==========================================
@safe_socket_event
@socketio.on('join_room')
def handle_join_room(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    if not room_id:
        return
    join_room(f'room_{room_id}')
    print(f'👉 {current_user.username} joined socket room_{room_id}')

    gs = get_game(room_id)
    if gs:
        emit('game:state', gs.to_dict())


@safe_socket_event
@socketio.on('leave_room')
def handle_leave_room(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    if room_id:
        leave_room(f'room_{room_id}')
        print(f'👋 {current_user.username} left socket room_{room_id}')


@safe_socket_event
@socketio.on('ping_server')
def handle_ping():
    emit('pong_server', {'ok': True})


# ==========================================
# 🏠 Lobby Party Events
# ==========================================
@safe_socket_event
@socketio.on('lobby:invite_send')
def handle_lobby_invite_send(data):
    if not current_user.is_authenticated:
        return
    to_uid = data.get('to_user_id')
    if not to_uid:
        return

    if get_lobby_of_user(current_user.id):
        emit('lobby:error', {'error': 'أنت بالفعل في مجموعة'})
        return
    if get_lobby_of_user(to_uid):
        emit('lobby:error', {'error': 'اللاعب في مجموعة أخرى'})
        return

    is_friend = Friendship.query.filter_by(
        user_id=current_user.id, friend_id=to_uid
    ).first()
    if not is_friend:
        emit('lobby:error', {'error': 'هذا اللاعب ليس صديقاً'})
        return

    party = lobby_parties.get(current_user.id)
    if party and len(party["members"]) >= 3:
        emit('lobby:error', {'error': 'المجموعة ممتلئة (4 أشخاص كحد أقصى)'})
        return

    for inv in lobby_pending.values():
        if inv["from"] == current_user.id and inv["to"] == to_uid:
            emit('lobby:error', {'error': 'الدعوة مرسلة بالفعل'})
            return

    _lobby_invite_counter[0] += 1
    inv_id = _lobby_invite_counter[0]
    lobby_pending[inv_id] = {
        "from": current_user.id,
        "to": to_uid,
        "ts": _time.time(),
    }

    sid = user_sockets.get(to_uid)
    if sid:
        socketio.emit('lobby:invite_received', {
            'invite_id': inv_id,
            'from': {
                'id': current_user.id,
                'username': current_user.username,
                'level': current_user.level,
            }
        }, to=sid)

    print(f'🏠 Lobby invite: {current_user.username} → {to_uid}')


@safe_socket_event
@socketio.on('lobby:invite_accept')
def handle_lobby_invite_accept(data):
    if not current_user.is_authenticated:
        return
    inv_id = data.get('invite_id')
    inv = lobby_pending.pop(inv_id, None)
    if not inv or inv["to"] != current_user.id:
        return

    from_uid = inv["from"]

    if not get_lobby_of_user(from_uid):
        if from_uid not in lobby_parties:
            lobby_parties[from_uid] = {"members": []}
    else:
        leader_uid = get_lobby_of_user(from_uid)
        if current_user.id in lobby_parties.get(leader_uid, {}).get("members", []):
            return
        party = lobby_parties.get(leader_uid)
        if party and len(party["members"]) < 3:
            party["members"].append(current_user.id)
            broadcast_lobby_update(leader_uid)
            emit_lobby_chat_to_party(leader_uid, {
                'leader_uid': leader_uid,
                'user_id': 0,
                'username': 'النظام',
                'text': f"👋 {current_user.username} انضم للمجموعة",
                'timestamp': int(_time.time() * 1000),
                'is_system': True,
            })
            print(f'🏠 Lobby: {current_user.username} joined {leader_uid}')
            return

    party = lobby_parties.setdefault(from_uid, {"members": []})
    if current_user.id not in party["members"] and len(party["members"]) < 3:
        party["members"].append(current_user.id)
        broadcast_lobby_update(from_uid)
        emit_lobby_chat_to_party(from_uid, {
            'leader_uid': from_uid,
            'user_id': 0,
            'username': 'النظام',
            'text': f"👋 {current_user.username} انضم للمجموعة",
            'timestamp': int(_time.time() * 1000),
            'is_system': True,
        })
        print(f'🏠 Lobby: {current_user.username} joined leader {from_uid}')


@safe_socket_event
@socketio.on('lobby:invite_reject')
def handle_lobby_invite_reject(data):
    if not current_user.is_authenticated:
        return
    inv_id = data.get('invite_id')
    inv = lobby_pending.pop(inv_id, None)
    if not inv or inv["to"] != current_user.id:
        return
    sid = user_sockets.get(inv["from"])
    if sid:
        socketio.emit('lobby:invite_rejected', {
            'invite_id': inv_id,
            'by_username': current_user.username,
        }, to=sid)


@safe_socket_event
@socketio.on('lobby:leave')
def handle_lobby_leave(data):
    if not current_user.is_authenticated:
        return
    user_id = current_user.id
    leader_uid = get_lobby_of_user(user_id)

    if leader_uid and leader_uid != user_id:
        emit_lobby_chat_to_party(leader_uid, {
            'leader_uid': leader_uid,
            'user_id': 0,
            'username': 'النظام',
            'text': f"👋 {current_user.username} غادر المجموعة",
            'timestamp': int(_time.time() * 1000),
            'is_system': True,
        })

    remove_from_lobby(user_id)


@safe_socket_event
@socketio.on('lobby:character_changed')
def handle_lobby_character_changed(data):
    if not current_user.is_authenticated:
        return
    leader_uid = get_lobby_of_user(current_user.id)
    if not leader_uid:
        return
    broadcast_lobby_update(leader_uid)


# ==========================================
# 💬 Lobby Chat Events
# ==========================================
@safe_socket_event
@socketio.on('lobby:chat_send')
def handle_lobby_chat_send(data):
    if not current_user.is_authenticated:
        return
    text = (data.get('text') or '').strip()
    if not text or len(text) > 200:
        return

    leader_uid = get_lobby_of_user(current_user.id)
    if not leader_uid:
        return

    msg = {
        'leader_uid': leader_uid,
        'user_id': current_user.id,
        'username': current_user.username,
        'text': text,
        'timestamp': int(_time.time() * 1000),
        'is_system': False,
    }

    _lobby_chat_history.setdefault(leader_uid, []).append(msg)
    if len(_lobby_chat_history[leader_uid]) > 100:
        _lobby_chat_history[leader_uid] = _lobby_chat_history[leader_uid][-100:]

    emit_lobby_chat_to_party(leader_uid, msg)


@safe_socket_event
@socketio.on('lobby:chat_history_request')
def handle_lobby_chat_history(data):
    if not current_user.is_authenticated:
        return
    leader_uid = get_lobby_of_user(current_user.id)
    if not leader_uid:
        return
    history = _lobby_chat_history.get(leader_uid, [])
    emit('lobby:chat_history', {
        'leader_uid': leader_uid,
        'messages': history[-50:],
    })


# ==========================================
# 🎮 Game events
# ==========================================
def _build_players_for_room(room):
    is_2v2 = (room.mode == '2v2')

    members = RoomMember.query.filter_by(room_id=room.id).order_by(RoomMember.id).all()

    humans = []
    for m in members:
        u = User.query.get(m.player_id)
        if not u:
            continue
        char = "sama"
        try:
            if u.save and u.save.selected_character:
                char = u.save.selected_character
        except Exception:
            pass
        humans.append({
            "player": Player(
                user_id=u.id,
                username=u.username,
                character=char,
                is_bot=False,
            ),
            "team_idx": m.team_idx,
        })

    try:
        raw = getattr(room, 'bots_data', None)
        bots = json.loads(raw or '[]')
    except Exception as e:
        print(f'⚠️ build bots_data error: {e}')
        bots = []

    bot_players = []
    for i, b in enumerate(bots):
        char = b.get('character')
        if not char:
            char = _random.choice(["sama", "kiro"])
        bot_name = b.get('name', f'بوت {i + 1}')
        bot_uid = -(i + 1)
        bot_players.append({
            "player": Player(
                user_id=bot_uid,
                username=bot_name,
                character=char,
                is_bot=True,
                bot_index=i,
            ),
            "team_idx": b.get('team_idx'),
        })

    if is_2v2:
        team0 = [x["player"] for x in humans + bot_players if x["team_idx"] == 0]
        team1 = [x["player"] for x in humans + bot_players if x["team_idx"] == 1]
        result = team0 + team1
    else:
        result = [x["player"] for x in humans] + [x["player"] for x in bot_players]

    print(f'🎮 Players built for room {room.id}: {len(result)} '
          f'(mode={room.mode}, is_2v2={is_2v2})')
    for i, p in enumerate(result):
        team = i // 2 if is_2v2 else "-"
        print(f'   [{i}] {p.username} (bot={p.is_bot}, char={p.character}, '
              f'uid={p.user_id}, team={team})')

    return result


@safe_socket_event
@socketio.on('game:start')
def handle_game_start(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    if not room_id:
        return

    room = Room.query.get(room_id)
    if not room:
        emit('game:error', {'error': 'الغرفة غير موجودة'})
        return

    gs = get_game(room_id)
    if gs:
        _broadcast_state(room_id)
        return

    if room.host_id != current_user.id:
        emit('game:error', {'error': 'فقط المضيف يمكنه البدء'})
        return

    players = _build_players_for_room(room)
    if len(players) < 2:
        emit('game:error', {'error': 'تحتاج لاعبين على الأقل'})
        return

    room.status = 'playing'
    db.session.commit()

    gs = create_game(room_id, room.mode, players)
    print(f'🎮 GameState created for room {room_id}: '
          f'{[p.username for p in players]} (phase={gs.phase})')

    for p in players:
        if p.is_bot:
            continue
        sid = user_sockets.get(p.user_id)
        if sid:
            try:
                socketio.server.enter_room(sid, f'room_{room_id}')
                print(f'   ↳ re-joined {p.username} to socket room_{room_id}')
            except Exception as e:
                print(f'   ⚠️ failed to re-join {p.username}: {e}')

    _broadcast_state(room_id)

    schedule_bot_rps(room_id, delay=2.0)
    schedule_human_rps_timeout(room_id, seconds=30)


# ==========================================
# 🎯 RPS
# ==========================================
def schedule_bot_rps(room_id, delay=2.0):
    def _runner():
        _time.sleep(delay)
        try:
            gs = get_game(room_id)
            if not gs or gs.phase != 'rps':
                return
            active = [p for p in gs.players if p.alive and p.user_id in gs.rps_active_ids]
            for p in active:
                if not p.is_bot:
                    continue
                if p.user_id in gs.rps_choices:
                    continue
                choice = _random.choice(['rock', 'paper', 'scissors'])
                res = gs.submit_rps_choice(p.user_id, choice)
                print(f'🤖 Bot RPS: {p.username} → {choice}')
                if res.get('tiebreak'):
                    socketio.emit('game:rps_tiebreak', {
                        'tied_ids': res.get('tied_ids', []),
                        'round': res.get('round', 2),
                    }, room=f'room_{room_id}')
                    _broadcast_state(room_id)
                    schedule_bot_rps(room_id, delay=1.5)
                    return
                if res.get('all_chosen'):
                    _broadcast_rps_result(room_id)
                    return
                _time.sleep(0.6)

            _broadcast_rps_progress(room_id)
        except Exception as e:
            print(f'❌ Bot RPS error: {e}')
            import traceback
            traceback.print_exc()

    t = threading.Thread(target=_runner, daemon=True)
    t.start()


def schedule_human_rps_timeout(room_id, seconds=30):
    """لو فيه بشر ما اختاروش RPS في الوقت → نختار لهم عشوائياً"""
    def _runner():
        _time.sleep(seconds)
        try:
            gs = get_game(room_id)
            if not gs or gs.phase != 'rps':
                return

            active = [p for p in gs.players
                      if p.alive and p.user_id in gs.rps_active_ids]
            missing = [p for p in active if p.user_id not in gs.rps_choices]

            if not missing:
                return

            print(f'⏰ RPS timeout in room {room_id} — auto-choosing for '
                  f'{[p.username for p in missing]}')

            for p in missing:
                choice = _random.choice(['rock', 'paper', 'scissors'])
                res = gs.submit_rps_choice(p.user_id, choice)
                print(f'   ⏰ Auto RPS: {p.username} → {choice}')

                if res.get('tiebreak'):
                    socketio.emit('game:rps_tiebreak', {
                        'tied_ids': res.get('tied_ids', []),
                        'round': res.get('round', 2),
                    }, room=f'room_{room_id}')
                    _broadcast_state(room_id)
                    schedule_bot_rps(room_id, delay=1.5)
                    schedule_human_rps_timeout(room_id, 20)
                    return

                if res.get('all_chosen'):
                    _broadcast_rps_result(room_id)
                    return

            _broadcast_rps_progress(room_id)
        except Exception as e:
            print(f'❌ RPS timeout error: {e}')
            import traceback
            traceback.print_exc()

    t = threading.Thread(target=_runner, daemon=True)
    t.start()


def _broadcast_rps_progress(room_id):
    try:
        gs = get_game(room_id)
        if not gs or gs.phase != 'rps':
            return
        active_count = len(gs.rps_active_ids)
        socketio.emit('game:rps_progress', {
            'chosen_count': len(gs.rps_choices),
            'total': active_count,
        }, room=f'room_{room_id}')
    except Exception as e:
        print(f'❌ _broadcast_rps_progress error: {e}')


def _broadcast_rps_result(room_id):
    try:
        gs = get_game(room_id)
        if not gs or not gs.rps_result:
            return

        socketio.emit('game:rps_result', {
            'result': gs.rps_result,
            'mode': gs.mode,
        }, room=f'room_{room_id}')

        order_names = [o['username'] for o in gs.rps_result['order']]
        print(f'🏆 RPS resolved in room {room_id}: {order_names}')
    except Exception as e:
        print(f'❌ _broadcast_rps_result error: {e}')
        return

    def _transition():
        _time.sleep(5.0)
        try:
            gs = get_game(room_id)
            if not gs or gs.phase != 'rps':
                return
            res = gs.apply_rps_start()
            if 'error' in res:
                print(f'❌ RPS transition error: {res["error"]}')
                return
            print(f'▶️ Room {room_id} → phase=playing')
            _broadcast_state(room_id)
            start_game_timer(room_id)
            schedule_bot_turn(room_id, 1.5)
        except Exception as e:
            print(f'❌ RPS transition error: {e}')
            import traceback
            traceback.print_exc()

    t = threading.Thread(target=_transition, daemon=True)
    t.start()


@safe_socket_event
@socketio.on('game:rps_choice')
def handle_rps_choice(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    choice = data.get('choice')

    gs = get_game(room_id)
    if not gs:
        return

    res = gs.submit_rps_choice(current_user.id, choice)
    if 'error' in res:
        emit('game:error', {'error': res['error']})
        return

    print(f'🎯 RPS choice in room {room_id}: {current_user.username} → {choice}')

    if res.get('tiebreak'):
        tied_ids = res.get('tied_ids', [])
        print(f'   ⚖️ Tiebreak round {res.get("round")} between: {tied_ids}')
        socketio.emit('game:rps_tiebreak', {
            'tied_ids': tied_ids,
            'round': res.get('round', 2),
        }, room=f'room_{room_id}')
        _broadcast_state(room_id)
        schedule_bot_rps(room_id, delay=1.5)
        schedule_human_rps_timeout(room_id, 20)
        return

    if res.get('all_chosen'):
        _broadcast_rps_result(room_id)
    else:
        _broadcast_rps_progress(room_id)


# ==========================================
# ⏱️ Game Timer
# ==========================================
_room_timers = {}

def start_game_timer(room_id):
    if room_id in _room_timers:
        return
    _room_timers[room_id] = True

    def _runner():
        try:
            while True:
                _time.sleep(1)
                gs = get_game(room_id)
                if not gs or gs.phase != 'playing':
                    break

                remaining = gs.time_remaining()
                socketio.emit('game:timer_tick', {
                    'remaining': remaining,
                    'total': gs.game_duration,
                }, room=f'room_{room_id}')

                if remaining <= 0:
                    result = gs.check_time_up()
                    if result:
                        print(f'⏰ Time up in room {room_id}: {result["winner_username"]} won')
                        socketio.emit('game:over', result, room=f'room_{room_id}')
                        remove_game(room_id)
                    break
        except Exception as e:
            print(f'❌ Timer error: {e}')
            import traceback
            traceback.print_exc()
        finally:
            _room_timers.pop(room_id, None)

    t = threading.Thread(target=_runner, daemon=True)
    t.start()


# ==========================================
# 💬 Game Chat
# ==========================================
@safe_socket_event
@socketio.on('game:chat_send')
def handle_chat_send(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    text = (data.get('text') or '').strip()

    if not text or len(text) > 200:
        return
    if not get_game(room_id):
        return

    msg = {
        'room_id': room_id,
        'user_id': current_user.id,
        'username': current_user.username,
        'text': text,
        'timestamp': int(_time.time() * 1000),
        'is_system': False,
    }

    _chat_history.setdefault(room_id, []).append(msg)
    if len(_chat_history[room_id]) > 100:
        _chat_history[room_id] = _chat_history[room_id][-100:]

    socketio.emit('game:chat_message', msg)


@safe_socket_event
@socketio.on('game:chat_history_request')
def handle_chat_history(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    if not room_id:
        return
    history = _chat_history.get(room_id, [])
    emit('game:chat_history', {
        'room_id': room_id,
        'messages': history[-50:],
    })


def emit_system_message(room_id, text):
    msg = {
        'room_id': room_id,
        'user_id': 0,
        'username': 'النظام',
        'text': text,
        'timestamp': int(_time.time() * 1000),
        'is_system': True,
    }
    _chat_history.setdefault(room_id, []).append(msg)
    socketio.emit('game:chat_message', msg)


# ==========================================
# 🏳️ Surrender
# ==========================================
@safe_socket_event
@socketio.on('game:surrender')
def handle_surrender(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    gs = get_game(room_id)
    if not gs:
        return

    res = gs.surrender(current_user.id)
    if 'error' in res:
        emit('game:error', res)
        return

    print(f'🏳️ {current_user.username} surrendered in room {room_id}')

    emit_system_message(room_id, f"🏳️ {res['player_username']} انسحب من اللعبة")

    win = gs.check_win()
    if win:
        socketio.emit('game:over', win, room=f'room_{room_id}')
        remove_game(room_id)
    else:
        _broadcast_state(room_id)
        schedule_bot_turn(room_id)


# ==========================================
# 🎲 Game Roll / Decisions
# ==========================================
@safe_socket_event
@socketio.on('game:roll')
def handle_game_roll(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    gs = get_game(room_id)
    if not gs:
        emit('game:error', {'error': 'مفيش لعبة نشطة'})
        return

    result = gs.roll_dice(current_user.id)
    if 'error' in result:
        err = result.get('error', '')
        if 'المحطة السوداء' in err:
            gs.advance_turn()
            print(f'🚔 Player tried to roll from jail — advancing turn')
            _broadcast_state(room_id)
            schedule_bot_turn(room_id)
            return
        emit('game:error', result)
        return

    print(f'🎲 Roll in room {room_id}: {result["d1"]}+{result["d2"]} '
          f'(total {result["total"]}) by {result["player_username"]}')

    socketio.emit('game:dice_result', result, room=f'room_{room_id}')
    _emit_money_events(room_id, result.get("money_events"))
    _emit_passive_triggers(room_id, result.get("passive_triggers"))

    evt = result.get("event")
    if evt == "sama_wings":
        landing = {
            "tile_index": 16,
            "tile_name": "بوابة العالم",
            "tile_type": "airport",
            "player_idx": result["player_index"],
            "player_username": result["player_username"],
            "event": "airport_offer",
            "money_events": result.get("money_events", []),
            "passive_triggers": result.get("passive_triggers", []),
        }
        socketio.emit('game:landing', landing, room=f'room_{room_id}')
        _broadcast_state(room_id)
        return

    elif evt == "three_doubles_jail":
        landing = {
            "tile_index": 8,
            "tile_name": "المحطة السوداء",
            "tile_type": "jail",
            "player_idx": result["player_index"],
            "player_username": result["player_username"],
            "event": "jail",
            "money_events": [],
            "passive_triggers": [],
        }
        socketio.emit('game:landing', landing, room=f'room_{room_id}')
        _advance_or_double(gs, room_id)
        return

    _broadcast_state(room_id)


@safe_socket_event
@socketio.on('game:animation_done')
def handle_animation_done(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    gs = get_game(room_id)
    if not gs:
        return

    res = gs.mark_move_done(current_user.id)
    if 'error' in res:
        return

    _emit_money_events(room_id, res.get("money_events"))
    _emit_passive_triggers(room_id, res.get("passive_triggers"))

    landing = gs.resolve_landing(current_user.id)
    print(f'📍 Landing in room {room_id}: {landing.get("event")}')

    _emit_money_events(room_id, landing.get("money_events"))
    _emit_passive_triggers(room_id, landing.get("passive_triggers"))

    socketio.emit('game:landing', landing, room=f'room_{room_id}')

    requires_decision = landing.get("event") in (
        "buy_offer", "upgrade_offer", "steal_offer",
        "chance", "plan_offer",
        "airport_offer", "double_rent_offer",
        "free_upgrade_offer"
    )

    if not requires_decision:
        _advance_or_double(gs, room_id)
    else:
        _broadcast_state(room_id)


def _advance_or_double(gs, room_id):
    print(f'🔄 _advance_or_double called. consecutive_doubles={gs.consecutive_doubles}, awaiting_decision={gs.awaiting_decision}')

    if gs.awaiting_decision is not None:
        print(f'⏸️ Awaiting decision: {gs.awaiting_decision.get("type")}')
        _broadcast_state(room_id)
        cur = gs.current_player()
        if cur and cur.is_bot:
            schedule_bot_turn(room_id, 1.2)
        else:
            schedule_human_timeout(room_id, 30)
        return

    win = gs.check_win()
    if win:
        print(f'🏆 Game over in room {room_id}: {win}')
        socketio.emit('game:over', win, room=f'room_{room_id}')
        remove_game(room_id)
        return

    current = gs.current_player()
    if current.jail_turns > 0:
        print(f'🚔 {current.username} في السجن — ننقل الدور')
        gs.advance_turn()
        print(f'⏭️ Turn advanced → {gs.current_player().username}')
        _broadcast_state(room_id)
        schedule_bot_turn(room_id)
        return

    if gs.consecutive_doubles > 0 and gs.dice_rolled:
        gs.awaiting_roll = True
        gs.dice_rolled = False
        gs.awaiting_decision = None
        gs.awaiting_move_done = False
        print(f'↩️ Same player rolls again (double)')
    else:
        gs.advance_turn()
        print(f'⏭️ Turn advanced → {gs.current_player().username}')

    _broadcast_state(room_id)
    schedule_bot_turn(room_id)


@safe_socket_event
@socketio.on('game:decision')
def handle_game_decision(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    action = data.get('action')
    tile_index = data.get('tile_index')

    gs = get_game(room_id)
    if not gs:
        return

    uid = current_user.id
    res = None
    if action == 'buy':
        res = gs.apply_buy(uid, tile_index)
    elif action == 'skip':
        res = gs.apply_skip(uid)
    elif action == 'upgrade':
        res = gs.apply_upgrade(uid, tile_index)
    elif action == 'steal':
        res = gs.apply_steal(uid, tile_index)
    else:
        emit('game:error', {'error': 'قرار غير معروف'})
        return

    if 'error' in res:
        emit('game:error', res)
        return

    _emit_money_events(room_id, res.get("money_events"))
    _emit_passive_triggers(room_id, res.get("passive_triggers"))

    print(f'✅ Decision {action} in room {room_id} by {uid}')
    _advance_or_double(gs, room_id)


@safe_socket_event
@socketio.on('game:airport_choice')
def handle_airport_choice(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    tile_index = data.get('tile_index')
    gs = get_game(room_id)
    if not gs:
        return

    res = gs.apply_airport_choice(current_user.id, tile_index)
    if 'error' in res:
        emit('game:error', res)
        return

    print(f'✈️ Airport choice in room {room_id}: tile {tile_index}')

    socketio.emit('game:airport_result', res, room=f'room_{room_id}')
    _broadcast_state(room_id)


@safe_socket_event
@socketio.on('game:double_rent_choice')
def handle_double_rent_choice(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    tile_index = data.get('tile_index')
    gs = get_game(room_id)
    if not gs:
        return

    res = gs.apply_double_rent_choice(current_user.id, tile_index)
    if 'error' in res:
        emit('game:error', res)
        return

    print(f'💵 Double rent in room {room_id}: tile {tile_index}')

    _emit_money_events(room_id, res.get("money_events"))
    socketio.emit('game:double_rent_result', res, room=f'room_{room_id}')
    _advance_or_double(gs, room_id)


@safe_socket_event
@socketio.on('game:free_upgrade_choice')
def handle_free_upgrade_choice(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    tile_index = data.get('tile_index')
    gs = get_game(room_id)
    if not gs:
        return

    res = gs.apply_free_upgrade(current_user.id, tile_index)
    if 'error' in res:
        emit('game:error', res)
        return

    print(f'🏠 Free upgrade in room {room_id}: tile {tile_index}')

    socketio.emit('game:free_upgrade_result', res, room=f'room_{room_id}')
    _advance_or_double(gs, room_id)


@safe_socket_event
@socketio.on('game:plan_choice')
def handle_plan_choice(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    accept = data.get('accept', True)
    gs = get_game(room_id)
    if not gs:
        return

    res = gs.apply_plan_choice(current_user.id, accept)
    if 'error' in res:
        emit('game:error', res)
        return

    print(f'📋 Plan choice in room {room_id}: {res.get("action")}')

    _emit_passive_triggers(room_id, res.get("passive_triggers"))
    socketio.emit('game:plan_result', res, room=f'room_{room_id}')
    _broadcast_state(room_id)


@safe_socket_event
@socketio.on('game:chance_continue')
def handle_chance_continue(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    gs = get_game(room_id)
    if not gs:
        return

    res = gs.resolve_chance_continue(current_user.id)
    if 'error' in res:
        emit('game:error', res)
        return

    print(f'🎴 Chance resolved in room {room_id}: {res.get("effect")}')

    _emit_money_events(room_id, res.get("money_events"))
    _emit_passive_triggers(room_id, res.get("passive_triggers"))

    socketio.emit('game:chance_result', res, room=f'room_{room_id}')

    if res.get("animation_path"):
        return

    if gs.awaiting_decision is not None:
        dec_type = gs.awaiting_decision.get("type")

        if dec_type == "airport":
            landing = {
                "tile_index": 16,
                "tile_name": "بوابة العالم",
                "tile_type": "airport",
                "player_idx": gs.current_turn_idx,
                "player_username": gs.current_player().username,
                "event": "airport_offer",
                "money_events": [],
                "passive_triggers": [],
            }
            socketio.emit('game:landing', landing, room=f'room_{room_id}')
            _broadcast_state(room_id)
            return

    _advance_or_double(gs, room_id)


@safe_socket_event
@socketio.on('game:leave')
def handle_game_leave(data):
    if not current_user.is_authenticated:
        return
    room_id = data.get('room_id')
    gs = get_game(room_id)
    if not gs:
        return
    p = gs.get_player_by_user_id(current_user.id)
    if p:
        p.alive = False
        print(f'💀 {p.username} left game in room {room_id}')
        emit_system_message(room_id, f"💀 {p.username} غادر اللعبة")
        _broadcast_state(room_id)


# ==========================================
# ⏰ Human Decision Timeout
# ==========================================
_human_timeouts = {}


def schedule_human_timeout(room_id, seconds=30):
    if room_id in _human_timeouts:
        return
    _human_timeouts[room_id] = True

    def _runner():
        _time.sleep(seconds)
        try:
            _human_timeouts.pop(room_id, None)
            gs = get_game(room_id)
            if not gs or gs.status != "playing":
                return
            if gs.awaiting_decision is None:
                return
            cur = gs.current_player()
            if cur.is_bot:
                return

            dec = gs.awaiting_decision
            print(f'⏰ Human timeout — auto-skip: {dec.get("type")}')

            dec_type = dec.get("type")
            if dec_type in ("buy", "upgrade", "steal"):
                gs.apply_skip(cur.user_id)
            elif dec_type == "chance":
                gs.resolve_chance_continue(cur.user_id)
            elif dec_type == "plan_choice":
                gs.apply_plan_choice(cur.user_id, True)
            elif dec_type == "airport":
                pick = 1
                for i in range(len(gs.board)):
                    if i == 16:
                        continue
                    t = gs.board[i]
                    if t["type"] == "property" and t.get("owner") is None:
                        pick = i
                        break
                res = gs.apply_airport_choice(cur.user_id, pick)
                socketio.emit('game:airport_result', res, room=f'room_{room_id}')
                path_len = len(res.get("animation_path", []))
                _time.sleep(path_len * 0.28 + 0.3)
                gs.mark_move_done(cur.user_id)
                landing = gs.resolve_landing(cur.user_id)
                socketio.emit('game:landing', landing, room=f'room_{room_id}')
            elif dec_type == "double_rent":
                owned = dec.get("owned_indices", [])
                if owned:
                    gs.apply_double_rent_choice(cur.user_id, owned[0])
            elif dec_type == "free_upgrade":
                owned = dec.get("owned_indices", [])
                if owned:
                    gs.apply_free_upgrade(cur.user_id, owned[0])

            _broadcast_state(room_id)
            _advance_or_double(gs, room_id)
        except Exception as e:
            print(f'❌ Human timeout error: {e}')
            import traceback
            traceback.print_exc()

    t = threading.Thread(target=_runner, daemon=True)
    t.start()


# ==========================================
# 🤖 Bot AI
# ==========================================
def schedule_bot_turn(room_id, delay=1.8):
    def _runner():
        _time.sleep(delay)
        try:
            _process_bot_turn(room_id)
        except Exception as e:
            print(f'❌ Bot turn error: {e}')
            import traceback
            traceback.print_exc()
            try:
                gs = get_game(room_id)
                if gs and gs.status == "playing":
                    gs.awaiting_decision = None
                    gs.awaiting_move_done = False
                    gs.advance_turn()
                    _broadcast_state(room_id)
                    schedule_bot_turn(room_id, 1.0)
            except Exception as e2:
                print(f'❌ Bot recovery error: {e2}')

    t = threading.Thread(target=_runner, daemon=True)
    t.start()


def _process_bot_turn(room_id):
    gs = get_game(room_id)
    if not gs or gs.status != "playing":
        return
    if gs.phase != 'playing':
        return

    cur = gs.current_player()
    if not cur.is_bot:
        return

    print(f'🤖 Bot turn: {cur.username} | awaiting_roll={gs.awaiting_roll} | awaiting_decision={gs.awaiting_decision}')

    if gs.awaiting_decision is not None:
        dec = gs.awaiting_decision
        dec_type = dec.get("type")

        if dec_type == "buy":
            tile = gs.board[dec["tile_index"]]
            if cur.money >= tile["price"] + 200:
                res = gs.apply_buy(cur.user_id, dec["tile_index"], is_bot=True)
                if res.get("money_events"):
                    _emit_money_events(room_id, res["money_events"])
                print(f'   🤖 Bot bought {tile["name"]}')
            else:
                gs.apply_skip(cur.user_id, is_bot=True)
                print(f'   🤖 Bot skipped {tile["name"]}')
            _advance_or_double(gs, room_id)
            return

        if dec_type == "upgrade":
            tile = gs.board[dec["tile_index"]]
            up_price = tile.get("upgrade_price", tile["price"] * 3 // 2)
            if cur.money >= up_price + 300:
                res = gs.apply_upgrade(cur.user_id, dec["tile_index"], is_bot=True)
                if res.get("money_events"):
                    _emit_money_events(room_id, res["money_events"])
                print(f'   🤖 Bot upgraded {tile["name"]}')
            else:
                gs.apply_skip(cur.user_id, is_bot=True)
            _advance_or_double(gs, room_id)
            return

        if dec_type == "steal":
            tile = gs.board[dec["tile_index"]]
            steal_price = int(tile["price"] * 1.5)
            if cur.money >= steal_price + 300:
                res = gs.apply_steal(cur.user_id, dec["tile_index"], is_bot=True)
                if res.get("money_events"):
                    _emit_money_events(room_id, res["money_events"])
                print(f'   🤖 Bot stole {tile["name"]}')
            else:
                gs.apply_skip(cur.user_id, is_bot=True)
            _advance_or_double(gs, room_id)
            return

        if dec_type == "chance":
            res = gs.resolve_chance_continue(cur.user_id, is_bot=True)
            if res.get("money_events"):
                _emit_money_events(room_id, res["money_events"])
            socketio.emit('game:chance_result', res, room=f'room_{room_id}')

            if res.get("animation_path"):
                path_len = len(res["animation_path"])
                _time.sleep(path_len * 0.28 + 0.5)
                r2 = gs.mark_move_done(cur.user_id, is_bot=True)
                if r2.get("money_events"):
                    _emit_money_events(room_id, r2["money_events"])
                landing = gs.resolve_landing(cur.user_id, is_bot=True)
                socketio.emit('game:landing', landing, room=f'room_{room_id}')
                requires = landing.get("event") in (
                    "buy_offer", "upgrade_offer", "steal_offer",
                    "chance", "plan_offer", "airport_offer",
                    "double_rent_offer", "free_upgrade_offer"
                )
                if not requires:
                    _advance_or_double(gs, room_id)
                else:
                    _broadcast_state(room_id)
                    schedule_bot_turn(room_id, 1.5)
                return

            _advance_or_double(gs, room_id)
            return

        if dec_type == "plan_choice":
            res = gs.apply_plan_choice(cur.user_id, True, is_bot=True)
            socketio.emit('game:plan_result', res, room=f'room_{room_id}')
            _broadcast_state(room_id)
            schedule_bot_turn(room_id, 1.5)
            return

        if dec_type == "airport":
            pick = 1
            for i in range(len(gs.board)):
                if i == 16:
                    continue
                t = gs.board[i]
                if t["type"] == "property" and t.get("owner") is None:
                    pick = i
                    break
            res = gs.apply_airport_choice(cur.user_id, pick, is_bot=True)
            socketio.emit('game:airport_result', res, room=f'room_{room_id}')
            _broadcast_state(room_id)
            path_len = len(res.get("animation_path", []))
            _time.sleep(path_len * 0.28 + 0.5)
            r2 = gs.mark_move_done(cur.user_id, is_bot=True)
            if r2.get("money_events"):
                _emit_money_events(room_id, r2["money_events"])
            landing = gs.resolve_landing(cur.user_id, is_bot=True)
            socketio.emit('game:landing', landing, room=f'room_{room_id}')
            requires = landing.get("event") in (
                "buy_offer", "upgrade_offer", "steal_offer",
                "chance", "plan_offer", "airport_offer",
                "double_rent_offer", "free_upgrade_offer"
            )
            if not requires:
                _advance_or_double(gs, room_id)
            else:
                _broadcast_state(room_id)
                schedule_bot_turn(room_id, 1.5)
            return

        if dec_type == "double_rent":
            owned = dec.get("owned_indices", [])
            if owned:
                res = gs.apply_double_rent_choice(cur.user_id, owned[0], is_bot=True)
                socketio.emit('game:double_rent_result', res, room=f'room_{room_id}')
            _advance_or_double(gs, room_id)
            return

        if dec_type == "free_upgrade":
            owned = dec.get("owned_indices", [])
            if owned:
                res = gs.apply_free_upgrade(cur.user_id, owned[0], is_bot=True)
                socketio.emit('game:free_upgrade_result', res, room=f'room_{room_id}')
            _advance_or_double(gs, room_id)
            return

        print(f'   ⚠️ Unknown bot decision: {dec_type}')
        gs.awaiting_decision = None
        _advance_or_double(gs, room_id)
        return

    if gs.awaiting_roll:
        result = gs.roll_dice(None, is_bot=True)
        if 'error' in result:
            print(f'   ⚠️ Bot roll error: {result["error"]}')
            gs.advance_turn()
            _broadcast_state(room_id)
            schedule_bot_turn(room_id, 1.5)
            return

        print(f'🎲 Bot rolled in room {room_id}: {result["d1"]}+{result["d2"]}={result["total"]}')

        socketio.emit('game:dice_result', result, room=f'room_{room_id}')
        _emit_money_events(room_id, result.get("money_events", []))
        _emit_passive_triggers(room_id, result.get("passive_triggers", []))

        evt = result.get("event")

        if evt == "sama_wings":
            landing = {
                "tile_index": 16,
                "tile_name": "بوابة العالم",
                "tile_type": "airport",
                "player_idx": result["player_index"],
                "player_username": result["player_username"],
                "event": "airport_offer",
                "money_events": result.get("money_events", []),
                "passive_triggers": result.get("passive_triggers", []),
            }
            socketio.emit('game:landing', landing, room=f'room_{room_id}')
            _broadcast_state(room_id)
            schedule_bot_turn(room_id, 1.5)
            return

        if evt == "three_doubles_jail":
            landing = {
                "tile_index": 8,
                "tile_name": "المحطة السوداء",
                "tile_type": "jail",
                "player_idx": result["player_index"],
                "player_username": result["player_username"],
                "event": "jail",
                "money_events": [],
                "passive_triggers": [],
            }
            socketio.emit('game:landing', landing, room=f'room_{room_id}')
            _advance_or_double(gs, room_id)
            return

        path_len = len(result.get("path", []))
        _time.sleep(path_len * 0.28 + 0.5)

        r2 = gs.mark_move_done(cur.user_id, is_bot=True)
        if r2.get("money_events"):
            _emit_money_events(room_id, r2["money_events"])

        landing = gs.resolve_landing(cur.user_id, is_bot=True)
        print(f'📍 Bot landing in room {room_id}: {landing.get("event")}')
        socketio.emit('game:landing', landing, room=f'room_{room_id}')
        _emit_money_events(room_id, landing.get("money_events", []))
        _emit_passive_triggers(room_id, landing.get("passive_triggers", []))

        requires = landing.get("event") in (
            "buy_offer", "upgrade_offer", "steal_offer",
            "chance", "plan_offer", "airport_offer",
            "double_rent_offer", "free_upgrade_offer"
        )

        if not requires:
            _advance_or_double(gs, room_id)
        else:
            _broadcast_state(room_id)
            schedule_bot_turn(room_id, 1.5)
        return


# ==========================================
# 🎲 Matchmaking
# ==========================================
from threading import Lock

matchmaking_queues = {
    '1v1': [],
    '1v1v1': [],
    '1v1v1v1': [],
    '2v2': [],
}
matchmaking_lock = Lock()

_MODE_CAPACITY = {
    '1v1': 2,
    '1v1v1': 3,
    '1v1v1v1': 4,
    '2v2': 4,
}


def queue_add_party(member_uids, mode):
    with matchmaking_lock:
        member_set = set(member_uids)
        for mode_key in matchmaking_queues:
            matchmaking_queues[mode_key] = [
                e for e in matchmaking_queues[mode_key]
                if not (set(e['member_uids']) & member_set)
            ]

        entry = {
            'member_uids': list(member_uids),
            'size': len(member_uids),
        }
        matchmaking_queues[mode].append(entry)
        return entry


def queue_remove_user(user_id):
    with matchmaking_lock:
        removed = False
        for mode_key in matchmaking_queues:
            before = len(matchmaking_queues[mode_key])
            matchmaking_queues[mode_key] = [
                e for e in matchmaking_queues[mode_key]
                if user_id not in e['member_uids']
            ]
            if len(matchmaking_queues[mode_key]) < before:
                removed = True
        return removed


def queue_size_players(mode):
    with matchmaking_lock:
        return sum(e['size'] for e in matchmaking_queues.get(mode, []))


def queue_try_match(mode, capacity):
    with matchmaking_lock:
        q = matchmaking_queues.get(mode, [])
        total = 0
        selected = []
        for e in q:
            if total + e['size'] <= capacity:
                selected.append(e)
                total += e['size']
                if total == capacity:
                    break

        if total == capacity:
            for e in selected:
                q.remove(e)
            all_uids = []
            for e in selected:
                all_uids.extend(e['member_uids'])
            return all_uids
        return None


def queue_broadcast_status(mode):
    with matchmaking_lock:
        total = sum(e['size'] for e in matchmaking_queues.get(mode, []))
    for uid in list(user_sockets.keys()):
        sid = user_sockets.get(uid)
        if sid:
            socketio.emit('matchmaking_status', {
                'mode': mode,
                'current': total,
                'capacity': _MODE_CAPACITY.get(mode, 4)
            }, to=sid)


def emit_match_found(user_ids, room_data_getter):
    for uid in user_ids:
        sid = user_sockets.get(uid)
        if sid:
            socketio.emit('match_found', {
                'room': room_data_getter(uid)
            }, to=sid)


# ==========================================
# 🧰 Helper Functions
# ==========================================

from datetime import datetime as _dt


def _datetime_utcnow():
    return _dt.utcnow()


def _serialize_room_simple(room):
    """نسخة مبسطة من serialize_room للاستخدام الداخلي"""
    members_db = RoomMember.query.filter_by(room_id=room.id).all()
    members = []
    for m in members_db:
        u = User.query.get(m.player_id)
        if u:
            members.append({
                'id': u.id,
                'username': u.username,
                'level': u.level,
                'avatar': u.avatar,
                'is_host': m.is_host,
                'is_bot': False,
                'team_idx': m.team_idx,
            })

    try:
        import json as _json
        bots = _json.loads(getattr(room, 'bots_data', '[]') or '[]')
    except Exception:
        bots = []

    for i, b in enumerate(bots):
        members.append({
            'id': f'bot_{i}',
            'username': b.get('name', f'بوت {i+1}'),
            'level': 1,
            'avatar': 'default',
            'is_host': False,
            'is_bot': True,
            'bot_index': i,
            'character': b.get('character', 'sama'),
            'team_idx': b.get('team_idx'),
        })

    capacity = {'1v1': 2, '1v1v1': 3, '1v1v1v1': 4, '2v2': 4}.get(room.mode, 4)

    return {
        'id': room.id,
        'host_id': room.host_id,
        'mode': room.mode,
        'status': room.status,
        'capacity': capacity,
        'members': members,
        'members_count': len(members),
    }


# ==========================================
# 🔄 Reconnect Grace Period Monitor
# ==========================================

def _cleanup_waiting_rooms(uid):
    """ينظّف غرف الانتظار لو الليدر خرج"""
    try:
        room = (RoomMember.query
                .join(Room)
                .filter(RoomMember.player_id == uid,
                        Room.status == 'waiting')
                .first())
        if not room:
            return
        room_obj = room.room
        if room_obj.host_id == uid:
            room_obj.status = 'closed'
            room_obj.closed_at = _datetime_utcnow()
            RoomInvite.query.filter_by(
                room_id=room_obj.id, status='pending'
            ).update({'status': 'cancelled'})
            RoomMember.query.filter_by(room_id=room_obj.id).delete()
            db.session.commit()
            emit_room_closed(room_obj.id)
            print(f'🚪 Room {room_obj.id} closed — host disconnected')
        else:
            RoomMember.query.filter_by(
                room_id=room_obj.id, player_id=uid
            ).delete()
            db.session.commit()
            emit_room_update(room_obj.id, _serialize_room_simple(room_obj))
            print(f'🚪 {uid} left waiting room {room_obj.id}')
    except Exception as e:
        print(f'⚠️ _cleanup_waiting_rooms error: {e}')
        import traceback
        traceback.print_exc()


def _handle_disconnect_timeout(uid, info):
    """يتعامل مع لاعب ما رجعش في الوقت — شامل كل الحالات"""
    room_id = info["room_id"]
    username = info.get("username", f"#{uid}")
    gs = get_game(room_id)

    if not gs:
        print(f'ℹ️ Game {room_id} already ended — no action needed')
        return

    p = gs.get_player_by_user_id(uid)
    if not p or not p.alive:
        return

    # ⚠️ حالة 1: اللعبة لسه في RPS
    if gs.phase == 'rps':
        print(f'⚠️ {username} disconnected during RPS — treating as quit')
        res = gs.surrender(uid)
        emit_system_message(
            room_id,
            f"💀 {username} خرج قبل ما يبدأ (انقطع الاتصال)"
        )
        if uid in gs.rps_active_ids:
            gs.rps_active_ids.remove(uid)
        _broadcast_state(room_id)

        alive_players = [pl for pl in gs.players if pl.alive]
        if len(alive_players) < 2:
            print(f'🚪 Game {room_id} ended — too few players')
            win = gs.check_win()
            if win:
                socketio.emit('game:over', win, room=f'room_{room_id}')
            remove_game(room_id)
            return

        if len(gs.rps_choices) >= len(gs.rps_active_ids):
            _broadcast_rps_result(room_id)
        else:
            _broadcast_rps_progress(room_id)
            schedule_bot_rps(room_id, delay=1.0)
        return

    # ⚠️ حالة 2: عنده قرار معلق
    if gs.awaiting_decision is not None:
        cur = gs.current_player()
        if cur and cur.user_id == uid:
            print(f'⚠️ {username} disconnected with pending decision '
                  f'({gs.awaiting_decision.get("type")}) — auto-skipping')

            _human_timeouts.pop(room_id, None)

            dec_type = gs.awaiting_decision.get("type")
            try:
                if dec_type in ("buy", "upgrade", "steal"):
                    gs.apply_skip(uid, is_bot=False)
                elif dec_type == "chance":
                    gs.resolve_chance_continue(uid)
                elif dec_type == "plan_choice":
                    gs.apply_plan_choice(uid, True)
                elif dec_type == "airport":
                    pick = 1
                    for i in range(len(gs.board)):
                        if i == 16:
                            continue
                        t = gs.board[i]
                        if t["type"] == "property" and t.get("owner") is None:
                            pick = i
                            break
                    res = gs.apply_airport_choice(uid, pick)
                    socketio.emit('game:airport_result', res,
                                  room=f'room_{room_id}')
                elif dec_type == "double_rent":
                    owned = gs.awaiting_decision.get("owned_indices", [])
                    if owned:
                        gs.apply_double_rent_choice(uid, owned[0])
                elif dec_type == "free_upgrade":
                    owned = gs.awaiting_decision.get("owned_indices", [])
                    if owned:
                        gs.apply_free_upgrade(uid, owned[0])
            except Exception as e:
                print(f'⚠️ auto-skip error: {e}')

    # ⚠️ حالة 3: أثناء الأنيميشن
    cur = gs.current_player()
    if cur and cur.user_id == uid and gs.awaiting_move_done:
        print(f'⚠️ {username} disconnected during move animation — forcing done')
        try:
            gs.mark_move_done(uid, is_bot=False)
        except Exception as e:
            print(f'⚠️ mark_move_done error: {e}')
        gs.awaiting_move_done = False

    # ✅ اعتبره منسحب
    res = gs.surrender(uid)
    print(f'💀 {username} timed out of game {room_id}')

    if 'error' in res:
        print(f'   ℹ️ surrender said: {res["error"]}')
    else:
        emit_system_message(
            room_id,
            f"💀 {username} خرج من اللعبة (انقطع الاتصال)"
        )

    _human_timeouts.pop(room_id, None)

    win = gs.check_win()
    if win:
        socketio.emit('game:over', win, room=f'room_{room_id}')
        remove_game(room_id)
    else:
        _broadcast_state(room_id)
        schedule_bot_turn(room_id)


def _reconnect_timeout_runner():
    """يتفقد المنقطعين كل 5 ثواني"""
    while True:
        try:
            _time.sleep(5)
            now = _time.time()
            expired = [
                uid for uid, info in list(disconnected_users.items())
                if now - info["time"] > RECONNECT_GRACE_SECONDS
            ]
            for uid in expired:
                info = disconnected_users.pop(uid, None)
                if not info:
                    continue
                _handle_disconnect_timeout(uid, info)
        except Exception as e:
            print(f'❌ reconnect monitor error: {e}')
            import traceback
            traceback.print_exc()


# ==========================================
# 🛡️ Global Socket.IO Error Handler
# ==========================================

@socketio.on_error_default
def _default_error_handler(e):
    print(f'\n❌ [GLOBAL SOCKET ERROR] {type(e).__name__}: {e}')
    traceback.print_exc()
    try:
        emit('game:error', {'error': 'حصل خطأ غير متوقع — جرب تاني'})
    except Exception:
        pass


# ✅ شغّل الـ monitor
_reconnect_monitor_thread = threading.Thread(
    target=_reconnect_timeout_runner,
    daemon=True
)
_reconnect_monitor_thread.start()
print('✅ Reconnect monitor started')