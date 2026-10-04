from flask import Flask, render_template, redirect, url_for, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import or_, and_
from datetime import datetime
import json

from extensions import db, bcrypt, login_manager, socketio
from models import (
    User, GameSave, Friendship, FriendRequest,
    Room, RoomMember, RoomInvite
)

# ==========================================
# إنشاء التطبيق
# ==========================================
app = Flask(__name__)
app.config['SECRET_KEY'] = 'change-this-secret-key-later-1234567890'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///game.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
bcrypt.init_app(app)
login_manager.init_app(app)
socketio.init_app(app)


# ==========================================
# Flask-Login
# ==========================================
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({'error': 'يجب تسجيل الدخول'}), 401


# ==========================================
# Blueprints
# ==========================================
from auth import auth_bp
from admin import admin_bp
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)

# ✅ استيراد helpers من sockets (معدّل)
from sockets import (
    emit_room_update, emit_room_closed, emit_game_started,
    emit_invite_to_user, emit_invite_cancelled,
    queue_add_party, queue_remove_user, queue_size_players,
    queue_try_match, queue_broadcast_status, emit_match_found,
    _MODE_CAPACITY
)


# ==========================================
# الصفحات
# ==========================================
@app.route('/')
def home():
    if not current_user.is_authenticated:
        return redirect(url_for('auth.login'))
    return render_template('milioner.html')


# ==========================================
# API الأصدقاء
# ==========================================

@app.route('/api/friends', methods=['GET'])
@login_required
def get_friends():
    friendships = Friendship.query.filter_by(user_id=current_user.id).all()
    friend_ids = [f.friend_id for f in friendships]
    friends = User.query.filter(User.id.in_(friend_ids)).all() if friend_ids else []

    fav_map = {f.friend_id: f.is_favorite for f in friendships}

    def sort_key(user):
        if fav_map.get(user.id, False):
            return 0
        if user.status == 'online' and not user.in_match:
            return 1
        if user.status == 'online' and user.in_match:
            return 2
        return 3

    friends_sorted = sorted(friends, key=sort_key)

    result = [{
        'id': u.id,
        'username': u.username,
        'level': u.level,
        'avatar': u.avatar,
        'status': u.status,
        'in_match': u.in_match,
        'last_seen': u.last_seen.isoformat() if u.last_seen else None,
        'is_favorite': fav_map.get(u.id, False)
    } for u in friends_sorted]

    return jsonify({'friends': result, 'count': len(result)})


@app.route('/api/friends/search', methods=['GET'])
@login_required
def search_users():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'users': []})

    users = User.query.filter(
        User.username.ilike(f'%{q}%'),
        User.id != current_user.id
    ).limit(20).all()

    friend_ids = [f.friend_id for f in Friendship.query.filter_by(user_id=current_user.id).all()]
    pending_sent = [r.receiver_id for r in FriendRequest.query.filter_by(sender_id=current_user.id, status='pending').all()]
    pending_received = [r.sender_id for r in FriendRequest.query.filter_by(receiver_id=current_user.id, status='pending').all()]
    excluded = set(friend_ids + pending_sent + pending_received)

    result = [{
        'id': u.id,
        'username': u.username,
        'level': u.level,
        'avatar': u.avatar,
        'status': u.status,
        'in_match': u.in_match
    } for u in users if u.id not in excluded]

    return jsonify({'users': result})


@app.route('/api/friends/request', methods=['POST'])
@login_required
def send_request():
    data = request.get_json() or {}
    username = data.get('username', '').strip()

    if not username:
        return jsonify({'error': 'اسم المستخدم مطلوب'}), 400

    receiver = User.query.filter_by(username=username).first()
    if not receiver:
        return jsonify({'error': 'لا يوجد لاعب بهذا الاسم'}), 404

    if receiver.id == current_user.id:
        return jsonify({'error': 'لا يمكنك إضافة نفسك'}), 400

    if Friendship.query.filter_by(user_id=current_user.id, friend_id=receiver.id).first():
        return jsonify({'error': 'هذا اللاعب صديق بالفعل'}), 400

    existing_req = FriendRequest.query.filter(
        or_(
            and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == receiver.id),
            and_(FriendRequest.sender_id == receiver.id, FriendRequest.receiver_id == current_user.id)
        ),
        FriendRequest.status == 'pending'
    ).first()
    if existing_req:
        return jsonify({'error': 'يوجد طلب صداقة معلق بالفعل'}), 400

    db.session.add(FriendRequest(sender_id=current_user.id, receiver_id=receiver.id))
    db.session.commit()
    return jsonify({'message': 'تم إرسال طلب الصداقة'})


@app.route('/api/friends/requests', methods=['GET'])
@login_required
def get_requests():
    incoming = FriendRequest.query.filter_by(receiver_id=current_user.id, status='pending').all()
    outgoing = FriendRequest.query.filter_by(sender_id=current_user.id, status='pending').all()

    def serialize(req, other_user):
        return {
            'id': req.id,
            'user': {
                'id': other_user.id,
                'username': other_user.username,
                'level': other_user.level,
                'avatar': other_user.avatar
            },
            'created_at': req.created_at.isoformat()
        }

    return jsonify({
        'incoming': [serialize(r, User.query.get(r.sender_id)) for r in incoming],
        'outgoing': [serialize(r, User.query.get(r.receiver_id)) for r in outgoing]
    })


@app.route('/api/friends/accept', methods=['POST'])
@login_required
def accept_request():
    data = request.get_json() or {}
    req = FriendRequest.query.get(data.get('request_id'))
    if not req or req.receiver_id != current_user.id or req.status != 'pending':
        return jsonify({'error': 'طلب غير صالح'}), 400

    req.status = 'accepted'
    db.session.add(Friendship(user_id=current_user.id, friend_id=req.sender_id))
    db.session.add(Friendship(user_id=req.sender_id, friend_id=current_user.id))
    db.session.commit()
    return jsonify({'message': 'تم قبول طلب الصداقة'})


@app.route('/api/friends/reject', methods=['POST'])
@login_required
def reject_request():
    data = request.get_json() or {}
    req = FriendRequest.query.get(data.get('request_id'))
    if not req or req.receiver_id != current_user.id or req.status != 'pending':
        return jsonify({'error': 'طلب غير صالح'}), 400

    req.status = 'rejected'
    db.session.commit()
    return jsonify({'message': 'تم رفض طلب الصداقة'})


@app.route('/api/friends/<int:friend_id>', methods=['DELETE'])
@login_required
def remove_friend(friend_id):
    Friendship.query.filter_by(user_id=current_user.id, friend_id=friend_id).delete()
    Friendship.query.filter_by(user_id=friend_id, friend_id=current_user.id).delete()
    db.session.commit()
    return jsonify({'message': 'تم إزالة الصديق'})


@app.route('/api/friends/favorite/<int:friend_id>', methods=['POST'])
@login_required
def toggle_favorite(friend_id):
    f = Friendship.query.filter_by(user_id=current_user.id, friend_id=friend_id).first()
    if not f:
        return jsonify({'error': 'ليس صديقاً'}), 404
    f.is_favorite = not f.is_favorite
    db.session.commit()
    return jsonify({'is_favorite': f.is_favorite})


@app.route('/api/friends/invite/<int:friend_id>', methods=['POST'])
@login_required
def invite_to_game(friend_id):
    """دعوة صديق للّوبي (نفس زر دعوة الموجود)"""
    from sockets import (
        get_lobby_of_user, lobby_parties,
        lobby_pending, _lobby_invite_counter,
        emit_invite_to_user
    )

    friend = User.query.get(friend_id)
    if not friend:
        return jsonify({'error': 'اللاعب غير موجود'}), 404

    if friend.status != 'online':
        return jsonify({'error': 'اللاعب غير متصل الآن'}), 400

    if get_lobby_of_user(current_user.id):
        return jsonify({'error': 'أنت بالفعل في مجموعة'}), 400
    if get_lobby_of_user(friend_id):
        return jsonify({'error': 'اللاعب في مجموعة أخرى'}), 400

    is_friend = Friendship.query.filter_by(
        user_id=current_user.id, friend_id=friend_id
    ).first()
    if not is_friend:
        return jsonify({'error': 'هذا اللاعب ليس صديقاً'}), 400

    party = lobby_parties.get(current_user.id)
    if party and len(party["members"]) >= 3:
        return jsonify({'error': 'المجموعة ممتلئة (4 أشخاص كحد أقصى)'}), 400

    _lobby_invite_counter[0] += 1
    inv_id = _lobby_invite_counter[0]
    lobby_pending[inv_id] = {
        "from": current_user.id,
        "to": friend_id,
        "ts": __import__('time').time(),
    }

    emit_invite_to_user(friend_id, {
        'invite_id': inv_id,
        'from': {
            'id': current_user.id,
            'username': current_user.username,
            'level': current_user.level,
        },
        'type': 'lobby',
    })

    return jsonify({'message': f'تم إرسال دعوة إلى {friend.username}', 'invite_id': inv_id})


@app.route('/api/friends/presence', methods=['POST'])
@login_required
def update_presence():
    data = request.get_json() or {}
    current_user.status = data.get('status', 'online')
    current_user.in_match = data.get('in_match', False)
    current_user.last_seen = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'تم تحديث الحالة'})


# ==========================================
# API اختيار الشخصية
# ==========================================

@app.route('/api/character/current', methods=['GET'])
@login_required
def get_current_character():
    save = GameSave.query.filter_by(user_id=current_user.id).first()
    return jsonify({
        'selected_character': save.selected_character if save else None,
        'unlocked': save.get_unlocked_list() if save else []
    })


@app.route('/api/character/select', methods=['POST'])
@login_required
def select_character():
    data = request.get_json() or {}
    char_id = data.get('character_id')

    if not char_id:
        return jsonify({'error': 'معرّف الشخصية مطلوب'}), 400

    save = GameSave.query.filter_by(user_id=current_user.id).first()
    if not save:
        save = GameSave(user_id=current_user.id)
        db.session.add(save)

    unlocked = save.get_unlocked_list()
    if char_id not in unlocked:
        unlocked.append(char_id)
        save.set_unlocked_list(unlocked)

    save.selected_character = char_id
    db.session.commit()

    return jsonify({'message': 'تم اختيار الشخصية', 'selected_character': char_id})


# ==========================================
# API غرف الأصدقاء
# ==========================================

ROOM_CAPACITY = {
    '1v1': 2,
    '1v1v1': 3,
    '1v1v1v1': 4,
    '2v2': 4,
}


def get_active_room_of(user_id):
    member = RoomMember.query.join(Room).filter(
        RoomMember.player_id == user_id,
        Room.status.in_(['waiting', 'playing'])
    ).first()
    if member:
        return member.room

    room = Room.query.filter(
        Room.host_id == user_id,
        Room.status.in_(['waiting', 'playing'])
    ).first()
    return room


def serialize_room(room, viewer_id=None):
    is_2v2 = (room.mode == '2v2')

    members_db = RoomMember.query.filter_by(room_id=room.id).order_by(RoomMember.id).all()

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
                'team_idx': m.team_idx if is_2v2 else None,
            })

    try:
        raw = getattr(room, 'bots_data', None)
        bots = json.loads(raw or '[]')
    except Exception as e:
        print(f"⚠️ serialize bots_data error: {e}")
        bots = []

    for i, b in enumerate(bots):
        members.append({
            'id': f"bot_{i}",
            'username': b.get('name', f'بوت {i+1}'),
            'level': 1,
            'avatar': 'default',
            'is_host': False,
            'is_bot': True,
            'bot_index': i,
            'character': b.get('character', 'sama'),
            'team_idx': b.get('team_idx') if is_2v2 else None,
        })

    if is_2v2:
        members.sort(key=lambda m: (
            m['team_idx'] if m['team_idx'] is not None else 99,
            0 if not m['is_bot'] else 1,
        ))

    pending_invites = RoomInvite.query.filter_by(
        room_id=room.id, status='pending'
    ).all()

    invites_data = []
    for inv in pending_invites:
        recv = User.query.get(inv.receiver_id)
        if recv:
            invites_data.append({
                'id': inv.id,
                'receiver': {
                    'id': recv.id,
                    'username': recv.username,
                    'level': recv.level,
                    'avatar': recv.avatar
                }
            })

    return {
        'id': room.id,
        'host_id': room.host_id,
        'is_host': (room.host_id == viewer_id) if viewer_id else False,
        'mode': room.mode,
        'status': room.status,
        'is_2v2': is_2v2,
        'capacity': ROOM_CAPACITY.get(room.mode, 4),
        'members': members,
        'members_count': len(members),
        'pending_invites': invites_data
    }


@app.route('/api/rooms/create', methods=['POST'])
@login_required
def create_room():
    data = request.get_json() or {}
    mode = data.get('mode')
    raw_team_idx = data.get('team_idx')

    team_idx = None
    if raw_team_idx is not None:
        try:
            team_idx = int(raw_team_idx)
        except (ValueError, TypeError):
            team_idx = None

    if mode not in ROOM_CAPACITY:
        return jsonify({'error': 'وضع غير صالح'}), 400

    if mode == '2v2':
        if team_idx not in (0, 1):
            return jsonify({'error': 'اختر فريق أولاً'}), 400
    else:
        team_idx = None

    existing = get_active_room_of(current_user.id)
    if existing:
        return jsonify({'error': 'أنت بالفعل في غرفة'}), 400

    RoomInvite.query.filter_by(
        receiver_id=current_user.id, status='pending'
    ).update({'status': 'cancelled'})

    room = Room(host_id=current_user.id, mode=mode, status='waiting')
    try:
        room.bots_data = '[]'
    except Exception:
        pass
    db.session.add(room)
    db.session.flush()

    member = RoomMember(
        room_id=room.id,
        player_id=current_user.id,
        is_host=True,
        team_idx=team_idx,
    )
    db.session.add(member)
    db.session.commit()

    room_data = serialize_room(room, current_user.id)
    emit_room_update(room.id, room_data)

    return jsonify({'room': room_data})


@app.route('/api/rooms/current', methods=['GET'])
@login_required
def get_current_room():
    room = get_active_room_of(current_user.id)
    if not room:
        return jsonify({'room': None})
    return jsonify({'room': serialize_room(room, current_user.id)})


@app.route('/api/rooms/invite', methods=['POST'])
@login_required
def invite_to_room():
    data = request.get_json() or {}
    receiver_id = data.get('receiver_id')

    if not receiver_id:
        return jsonify({'error': 'معرّف الصديق مطلوب'}), 400

    room = get_active_room_of(current_user.id)
    if not room:
        return jsonify({'error': 'أنت لست في غرفة'}), 400

    if room.host_id != current_user.id:
        return jsonify({'error': 'فقط المضيف يمكنه الدعوة'}), 403

    if room.status != 'waiting':
        return jsonify({'error': 'الغرفة لم تعد تستقبل لاعبين'}), 400

    capacity = ROOM_CAPACITY.get(room.mode, 4)
    members_count = RoomMember.query.filter_by(room_id=room.id).count()

    try:
        raw = getattr(room, 'bots_data', None)
        bots_count = len(json.loads(raw or '[]'))
    except Exception:
        bots_count = 0

    pending_count = RoomInvite.query.filter_by(room_id=room.id, status='pending').count()

    if members_count + bots_count + pending_count >= capacity:
        return jsonify({'error': 'الغرفة ممتلئة'}), 400

    is_friend = Friendship.query.filter_by(
        user_id=current_user.id, friend_id=receiver_id
    ).first()
    if not is_friend:
        return jsonify({'error': 'هذا اللاعب ليس صديقاً'}), 400

    receiver = User.query.get(receiver_id)
    if not receiver:
        return jsonify({'error': 'اللاعب غير موجود'}), 404

    if get_active_room_of(receiver_id):
        return jsonify({'error': 'اللاعب في غرفة أخرى'}), 400

    existing_invite = RoomInvite.query.filter_by(
        room_id=room.id, receiver_id=receiver_id, status='pending'
    ).first()
    if existing_invite:
        return jsonify({'error': 'تم دعوة اللاعب بالفعل'}), 400

    invite = RoomInvite(
        room_id=room.id,
        sender_id=current_user.id,
        receiver_id=receiver_id
    )
    db.session.add(invite)
    db.session.commit()

    invite_data = {
        'invite_id': invite.id,
        'room_id': room.id,
        'mode': room.mode,
        'capacity': ROOM_CAPACITY.get(room.mode, 4),
        'members_count': RoomMember.query.filter_by(room_id=room.id).count(),
        'host': {
            'id': current_user.id,
            'username': current_user.username,
            'level': current_user.level,
            'avatar': current_user.avatar
        }
    }
    emit_invite_to_user(receiver_id, invite_data)
    emit_room_update(room.id, serialize_room(room, current_user.id))

    return jsonify({'message': 'تم إرسال الدعوة', 'invite_id': invite.id})


@app.route('/api/rooms/notifications', methods=['GET'])
@login_required
def get_room_notifications():
    pending_invites = RoomInvite.query.filter_by(
        receiver_id=current_user.id, status='pending'
    ).all()

    invites = []
    for inv in pending_invites:
        room = Room.query.get(inv.room_id)
        if not room or room.status != 'waiting':
            inv.status = 'expired'
            db.session.commit()
            continue

        sender = User.query.get(inv.sender_id)
        members_count = RoomMember.query.filter_by(room_id=room.id).count()

        invites.append({
            'invite_id': inv.id,
            'room_id': room.id,
            'mode': room.mode,
            'capacity': ROOM_CAPACITY.get(room.mode, 4),
            'members_count': members_count,
            'host': {
                'id': sender.id,
                'username': sender.username,
                'level': sender.level,
                'avatar': sender.avatar
            } if sender else None,
            'created_at': inv.created_at.isoformat()
        })

    room = get_active_room_of(current_user.id)
    current_room = serialize_room(room, current_user.id) if room else None

    return jsonify({
        'invites': invites,
        'room': current_room
    })


@app.route('/api/rooms/respond', methods=['POST'])
@login_required
def respond_to_invite():
    data = request.get_json() or {}
    invite_id = data.get('invite_id')
    accept = data.get('accept', False)
    raw_team_idx = data.get('team_idx')

    print(f'📥 respond_to_invite: invite_id={invite_id}, '
          f'accept={accept}, raw_team_idx={raw_team_idx!r}')

    team_idx = None
    if raw_team_idx is not None:
        try:
            team_idx = int(raw_team_idx)
        except (ValueError, TypeError):
            team_idx = None

    invite = RoomInvite.query.get(invite_id)
    if not invite or invite.receiver_id != current_user.id or invite.status != 'pending':
        return jsonify({'error': 'دعوة غير صالحة'}), 400

    room = Room.query.get(invite.room_id)
    if not room or room.status != 'waiting':
        invite.status = 'expired'
        db.session.commit()
        return jsonify({'error': 'الغرفة لم تعد متاحة'}), 400

    if not accept:
        invite.status = 'rejected'
        db.session.commit()
        return jsonify({'message': 'تم رفض الدعوة'})

    if get_active_room_of(current_user.id):
        return jsonify({'error': 'أنت بالفعل في غرفة'}), 400

    is_2v2 = (room.mode == '2v2')

    capacity = ROOM_CAPACITY.get(room.mode, 4)
    members_count = RoomMember.query.filter_by(room_id=room.id).count()

    try:
        raw = getattr(room, 'bots_data', None)
        bots = json.loads(raw or '[]')
    except Exception:
        bots = []

    if members_count + len(bots) >= capacity:
        invite.status = 'expired'
        db.session.commit()
        return jsonify({'error': 'الغرفة ممتلئة'}), 400

    if is_2v2:
        t0_h = RoomMember.query.filter_by(room_id=room.id, team_idx=0).count()
        t1_h = RoomMember.query.filter_by(room_id=room.id, team_idx=1).count()
        t0_b = sum(1 for b in bots if b.get('team_idx') == 0)
        t1_b = sum(1 for b in bots if b.get('team_idx') == 1)
        t0_total = t0_h + t0_b
        t1_total = t1_h + t1_b

        print(f'   teams: A={t0_total}/2, B={t1_total}/2, requested={team_idx}')

        if team_idx not in (0, 1):
            if t0_total < 2:
                team_idx = 0
            elif t1_total < 2:
                team_idx = 1
            else:
                return jsonify({'error': 'كلا الفريقين ممتلئين'}), 400
            print(f'   ↳ auto-assigned to team {team_idx}')

        elif team_idx == 0 and t0_total >= 2:
            if t1_total < 2:
                team_idx = 1
                print(f'   ↳ team A full, switched to team B')
            else:
                return jsonify({'error': 'الفريق الأول ممتلئ'}), 400
        elif team_idx == 1 and t1_total >= 2:
            if t0_total < 2:
                team_idx = 0
                print(f'   ↳ team B full, switched to team A')
            else:
                return jsonify({'error': 'الفريق الثاني ممتلئ'}), 400
    else:
        team_idx = None

    invite.status = 'accepted'
    member = RoomMember(
        room_id=room.id,
        player_id=current_user.id,
        is_host=False,
        team_idx=team_idx,
    )
    db.session.add(member)
    db.session.commit()

    room_data = serialize_room(room, current_user.id)
    emit_room_update(room.id, room_data)

    print(f'   ✅ joined room {room.id} as team {team_idx}')

    return jsonify({
        'message': 'تم قبول الدعوة',
        'room': room_data,
        'team_idx': team_idx,
    })


@app.route('/api/rooms/leave', methods=['POST'])
@login_required
def leave_room():
    room = get_active_room_of(current_user.id)
    if not room:
        return jsonify({'error': 'أنت لست في غرفة'}), 400

    is_host = (room.host_id == current_user.id)

    if is_host:
        room.status = 'closed'
        room.closed_at = datetime.utcnow()
        RoomInvite.query.filter_by(
            room_id=room.id, status='pending'
        ).update({'status': 'cancelled'})
        RoomMember.query.filter_by(room_id=room.id).delete()
        db.session.commit()

        emit_room_closed(room.id)
        return jsonify({'message': 'تم إغلاق الغرفة'})

    RoomMember.query.filter_by(
        room_id=room.id, player_id=current_user.id
    ).delete()
    db.session.commit()

    emit_room_update(room.id, serialize_room(room, current_user.id))
    return jsonify({'message': 'تم الخروج من الغرفة'})


@app.route('/api/rooms/kick/<int:player_id>', methods=['POST'])
@login_required
def kick_from_room(player_id):
    room = get_active_room_of(current_user.id)
    if not room or room.host_id != current_user.id:
        return jsonify({'error': 'غير مسموح'}), 403

    if player_id == current_user.id:
        return jsonify({'error': 'لا يمكنك طرد نفسك'}), 400

    RoomMember.query.filter_by(
        room_id=room.id, player_id=player_id
    ).delete()
    db.session.commit()

    emit_room_update(room.id, serialize_room(room, current_user.id))
    return jsonify({'message': 'تم طرد اللاعب'})


@app.route('/api/rooms/start', methods=['POST'])
@login_required
def start_room_game():
    room = get_active_room_of(current_user.id)
    if not room:
        return jsonify({'error': 'أنت لست في غرفة'}), 400

    if room.host_id != current_user.id:
        return jsonify({'error': 'فقط المضيف يمكنه البدء'}), 403

    from game_state import get_game
    existing_gs = get_game(room.id)
    if existing_gs:
        print(f'ℹ️ Room {room.id} already has GameState — returning success')
        return jsonify({
            'message': 'اللعبة بدأت بالفعل',
            'room': serialize_room(room, current_user.id)
        })

    if room.status not in ('waiting', 'playing'):
        return jsonify({'error': 'الغرفة غير متاحة'}), 400

    capacity = ROOM_CAPACITY.get(room.mode, 4)
    members_count = RoomMember.query.filter_by(room_id=room.id).count()

    try:
        raw = getattr(room, 'bots_data', None)
        bots = json.loads(raw or '[]')
    except Exception:
        bots = []

    if room.mode == '2v2':
        t0m = RoomMember.query.filter_by(room_id=room.id, team_idx=0).count()
        t1m = RoomMember.query.filter_by(room_id=room.id, team_idx=1).count()
        t0b = sum(1 for b in bots if b.get('team_idx') == 0)
        t1b = sum(1 for b in bots if b.get('team_idx') == 1)
        if (t0m + t0b) != 2 or (t1m + t1b) != 2:
            return jsonify({'error': 'كلا الفريقين لازم يكون فيه 2 لاعبين (أو بوتات)'}), 400
    else:
        if members_count + len(bots) < capacity:
            return jsonify({'error': f'تحتاج {capacity} لاعبين (أو بوتات) للبدء'}), 400

    room.status = 'playing'
    db.session.commit()

    room_data = serialize_room(room, current_user.id)
    emit_game_started(room.id, room_data)

    return jsonify({'message': 'بدأت اللعبة', 'room': room_data})


# ==========================================
# 🤖 API البوتات
# ==========================================

@app.route('/api/rooms/add_bot', methods=['POST'])
@login_required
def add_bot_to_room():
    import random

    data = request.get_json() or {}
    raw_team_idx = data.get('team_idx')

    team_idx = None
    if raw_team_idx is not None:
        try:
            team_idx = int(raw_team_idx)
        except (ValueError, TypeError):
            team_idx = None

    room = get_active_room_of(current_user.id)
    if not room or room.host_id != current_user.id:
        return jsonify({'error': 'غير مسموح'}), 403

    if room.status != 'waiting':
        return jsonify({'error': 'الغرفة لم تعد تستقبل لاعبين'}), 400

    is_2v2 = (room.mode == '2v2')

    capacity = ROOM_CAPACITY.get(room.mode, 4)
    members_count = RoomMember.query.filter_by(room_id=room.id).count()

    try:
        raw = getattr(room, 'bots_data', None)
        bots = json.loads(raw or '[]')
    except Exception as e:
        print(f"⚠️ add_bot bots_data error: {e}")
        bots = []

    if members_count + len(bots) >= capacity:
        return jsonify({'error': 'الغرفة ممتلئة'}), 400

    if is_2v2:
        t0_h = RoomMember.query.filter_by(room_id=room.id, team_idx=0).count()
        t1_h = RoomMember.query.filter_by(room_id=room.id, team_idx=1).count()
        t0_b = sum(1 for b in bots if b.get('team_idx') == 0)
        t1_b = sum(1 for b in bots if b.get('team_idx') == 1)
        t0_total = t0_h + t0_b
        t1_total = t1_h + t1_b

        if team_idx not in (0, 1):
            if t0_total < 2:
                team_idx = 0
            elif t1_total < 2:
                team_idx = 1
            else:
                return jsonify({'error': 'كلا الفريقين ممتلئين'}), 400

        if team_idx == 0 and t0_total >= 2:
            if t1_total < 2:
                team_idx = 1
            else:
                return jsonify({'error': 'الفريق الأول ممتلئ'}), 400
        elif team_idx == 1 and t1_total >= 2:
            if t0_total < 2:
                team_idx = 0
            else:
                return jsonify({'error': 'الفريق الثاني ممتلئ'}), 400
    else:
        team_idx = None

    chars = ["sama", "kiro"]
    char = random.choice(chars)
    bot_name = f"بوت {len(bots) + 1}"
    print(f'🤖 Bot created: char={char}, team={team_idx}')

    bots.append({
        "name": bot_name,
        "character": char,
        "team_idx": team_idx,
    })
    room.bots_data = json.dumps(bots)
    db.session.commit()

    room_data = serialize_room(room, current_user.id)
    emit_room_update(room.id, room_data)

    return jsonify({'message': 'تمت إضافة البوت', 'room': room_data})


@app.route('/api/rooms/remove_bot', methods=['POST'])
@login_required
def remove_bot_from_room():
    data = request.get_json() or {}
    bot_idx = data.get('bot_index', -1)

    room = get_active_room_of(current_user.id)
    if not room or room.host_id != current_user.id:
        return jsonify({'error': 'غير مسموح'}), 403

    if room.status != 'waiting':
        return jsonify({'error': 'الغرفة بدأت بالفعل'}), 400

    try:
        raw = getattr(room, 'bots_data', None)
        bots = json.loads(raw or '[]')
    except Exception as e:
        print(f"⚠️ remove_bot bots_data error: {e}")
        bots = []

    if bot_idx < 0 or bot_idx >= len(bots):
        return jsonify({'error': 'بوت غير موجود'}), 400

    bots.pop(bot_idx)

    for i, b in enumerate(bots):
        b["name"] = f"بوت {i + 1}"

    room.bots_data = json.dumps(bots)
    db.session.commit()

    room_data = serialize_room(room, current_user.id)
    emit_room_update(room.id, room_data)

    return jsonify({'message': 'تم إزالة البوت', 'room': room_data})


# ==========================================
# 🎲 API اللعب العشوائي (Matchmaking)
# ==========================================

@app.route('/api/matchmaking/join', methods=['POST'])
@login_required
def join_matchmaking():
    from sockets import (
        get_lobby_of_user, lobby_parties,
        queue_add_party, queue_try_match,
        queue_size_players, queue_broadcast_status
    )

    data = request.get_json() or {}
    mode = data.get('mode')

    if mode not in ROOM_CAPACITY:
        return jsonify({'error': 'وضع غير صالح'}), 400

    if get_active_room_of(current_user.id):
        return jsonify({'error': 'أنت بالفعل في غرفة'}), 400

    capacity = ROOM_CAPACITY[mode]

    leader_uid = get_lobby_of_user(current_user.id)
    member_uids = [current_user.id]

    if leader_uid:
        if leader_uid != current_user.id:
            return jsonify({'error': 'القائد فقط يمكنه بدء البحث'}), 403
        party = lobby_parties.get(leader_uid)
        if party:
            member_uids = [leader_uid] + list(party['members'])

        if len(member_uids) > capacity:
            return jsonify({
                'error': f'هذا الوضع يقبل حتى {capacity} لاعبين فقط'
            }), 400

    queue_add_party(member_uids, mode)

    matched = queue_try_match(mode, capacity)

    if matched:
        room = Room(host_id=matched[0], mode=mode, status='waiting')
        try:
            room.bots_data = '[]'
        except Exception:
            pass
        db.session.add(room)
        db.session.flush()

        is_2v2 = (mode == '2v2')

        for i, uid in enumerate(matched):
            team_idx = None
            if is_2v2:
                if leader_uid and len(member_uids) == 2 and uid in member_uids:
                    team_idx = 0
                elif leader_uid and len(member_uids) == 2:
                    team_idx = 1
                else:
                    team_idx = (i % 2)

            db.session.add(RoomMember(
                room_id=room.id,
                player_id=uid,
                is_host=(i == 0),
                team_idx=team_idx,
            ))
        db.session.commit()

        def get_room_data(uid):
            return serialize_room(room, uid)

        emit_match_found(matched, get_room_data)

        return jsonify({
            'status': 'matched',
            'room': serialize_room(room, current_user.id)
        })
    else:
        queue_broadcast_status(mode)
        return jsonify({
            'status': 'waiting',
            'mode': mode,
            'current': queue_size_players(mode),
            'capacity': capacity
        })


@app.route('/api/matchmaking/leave', methods=['POST'])
@login_required
def leave_matchmaking():
    from sockets import queue_remove_user, queue_broadcast_status
    from sockets import get_lobby_of_user, lobby_parties

    leader_uid = get_lobby_of_user(current_user.id)
    if leader_uid:
        if leader_uid != current_user.id:
            return jsonify({'error': 'القائد فقط يمكنه إلغاء البحث'}), 403
        party = lobby_parties.get(leader_uid)
        if party:
            member_uids = [leader_uid] + list(party['members'])
            for uid in member_uids:
                queue_remove_user(uid)
        else:
            queue_remove_user(current_user.id)
    else:
        queue_remove_user(current_user.id)

    for mode in ROOM_CAPACITY:
        queue_broadcast_status(mode)
    return jsonify({'message': 'تم إلغاء البحث'})


@app.route('/api/matchmaking/status', methods=['GET'])
@login_required
def matchmaking_status():
    from sockets import matchmaking_queues, queue_size_players
    for mode in ROOM_CAPACITY:
        for entry in matchmaking_queues.get(mode, []):
            if current_user.id in entry['member_uids']:
                return jsonify({
                    'in_queue': True,
                    'mode': mode,
                    'current': queue_size_players(mode),
                    'capacity': ROOM_CAPACITY[mode]
                })
    return jsonify({'in_queue': False})


# ==========================================
# إنشاء قاعدة البيانات + تنظيف الغرف القديمة
# ==========================================
with app.app_context():
    db.create_all()

    try:
        stale_rooms = Room.query.filter(
            Room.status.in_(['waiting', 'playing'])
        ).all()
        for r in stale_rooms:
            r.status = 'closed'
        db.session.commit()
        if stale_rooms:
            print(f"🧹 اتقفلت {len(stale_rooms)} غرفة قديمة")
    except Exception as e:
        print(f"⚠️ فشل تنظيف الغرف: {e}")

    print("✅ قاعدة البيانات جاهزة")


if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000,
                 allow_unsafe_werkzeug=True)