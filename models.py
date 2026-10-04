# models.py
from extensions import db
from flask_login import UserMixin
from datetime import datetime
import json


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(30), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(200), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_banned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, default=datetime.utcnow)

    # حقول الأصدقاء
    level = db.Column(db.Integer, default=1)
    avatar = db.Column(db.String(100), default='default')
    status = db.Column(db.String(20), default='offline')
    in_match = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)

    save = db.relationship('GameSave', backref='user', uselist=False, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<User {self.username}>'


class GameSave(db.Model):
    __tablename__ = 'game_saves'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)

    money = db.Column(db.Integer, default=1000)
    gems = db.Column(db.Integer, default=20)
    level = db.Column(db.Integer, default=1)
    selected_character = db.Column(db.String(50), default=None)
    unlocked_characters = db.Column(db.Text, default='[]')

    stats_wins = db.Column(db.Integer, default=0)
    stats_losses = db.Column(db.Integer, default=0)
    stats_games = db.Column(db.Integer, default=0)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_unlocked_list(self):
        try:
            return json.loads(self.unlocked_characters or '[]')
        except Exception:
            return []

    def set_unlocked_list(self, lst):
        self.unlocked_characters = json.dumps(lst or [])


# ==========================================
# الأصدقاء
# ==========================================

class Friendship(db.Model):
    __tablename__ = 'friendships'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    is_favorite = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'friend_id', name='unique_friendship'),
    )


class FriendRequest(db.Model):
    __tablename__ = 'friend_requests'

    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('sender_id', 'receiver_id', name='unique_request'),
    )


# ==========================================
# غرف الأصدقاء
# ==========================================

class Room(db.Model):
    __tablename__ = 'rooms'

    id = db.Column(db.Integer, primary_key=True)
    host_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    mode = db.Column(db.String(20), nullable=False)       # 1v1 / 1v1v1 / 1v1v1v1 / 2v2
    status = db.Column(db.String(20), default='waiting')  # waiting / playing / closed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    closed_at = db.Column(db.DateTime, nullable=True)
    bots_data = db.Column(db.Text, default='[]')   # JSON list of bots
    members = db.relationship('RoomMember', backref='room', cascade='all, delete-orphan')
    invites = db.relationship('RoomInvite', backref='room', cascade='all, delete-orphan')


class RoomMember(db.Model):
    __tablename__ = 'room_members'

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('rooms.id'), nullable=False)
    player_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    is_host = db.Column(db.Boolean, default=False)
    team_idx = db.Column(db.Integer, nullable=True)   # ✅ جديد: 0 أو 1 (2v2 فقط)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('room_id', 'player_id', name='unique_room_member'),
    )


class RoomInvite(db.Model):
    __tablename__ = 'room_invites'

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('rooms.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending / accepted / rejected / cancelled / expired
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('room_id', 'receiver_id', name='unique_room_invite'),
    )