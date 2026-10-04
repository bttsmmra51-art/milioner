# auth.py
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from extensions import db, bcrypt
from models import User, GameSave
from datetime import datetime

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    
    if request.method == 'POST':
        data = request.get_json() or {}
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''
        email = (data.get('email') or '').strip() or None
        
        # التحقق
        if len(username) < 3:
            return jsonify({'success': False, 'error': 'اسم المستخدم قصير جداً (3 أحرف على الأقل)'}), 400
        if len(password) < 6:
            return jsonify({'success': False, 'error': 'كلمة السر قصيرة جداً (6 أحرف على الأقل)'}), 400
        
        if User.query.filter_by(username=username).first():
            return jsonify({'success': False, 'error': 'اسم المستخدم موجود بالفعل'}), 400
        if email and User.query.filter_by(email=email).first():
            return jsonify({'success': False, 'error': 'البريد الإلكتروني مستخدم بالفعل'}), 400
        
        # إنشاء اللاعب
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        user = User(username=username, email=email, password_hash=password_hash)
        
        # أول لاعب يصبح أدمن
        if User.query.count() == 0:
            user.is_admin = True
        
        db.session.add(user)
        db.session.flush()
        
        # إنشاء حفظ افتراضي
        save = GameSave(user_id=user.id)
        db.session.add(save)
        db.session.commit()
        
        login_user(user)
        return jsonify({'success': True, 'redirect': '/'})
    
    return render_template('register.html')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('home'))
    
    if request.method == 'POST':
        data = request.get_json() or {}
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''
        
        user = User.query.filter(
            (User.username == username) | (User.email == username)
        ).first()
        
        if not user or not bcrypt.check_password_hash(user.password_hash, password):
            return jsonify({'success': False, 'error': 'اسم المستخدم أو كلمة السر خطأ'}), 401
        
        if user.is_banned:
            return jsonify({'success': False, 'error': 'حسابك محظور. تواصل مع الأدمن'}), 403
        
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        login_user(user, remember=True)
        return jsonify({'success': True, 'redirect': '/'})
    
    return render_template('login.html')


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))


# ==========================================
# APIs للعبة
# ==========================================

@auth_bp.route('/api/me')
@login_required
def api_me():
    save = current_user.save
    if not save:
        save = GameSave(user_id=current_user.id)
        db.session.add(save)
        db.session.commit()
    
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'email': current_user.email,
        'is_admin': current_user.is_admin,
        'money': save.money,
        'gems': save.gems,
        'level': save.level,
        'selected_character': save.selected_character,
        'unlocked_characters': save.get_unlocked_list(),
        'stats': {
            'wins': save.stats_wins,
            'losses': save.stats_losses,
            'games': save.stats_games
        }
    })


@auth_bp.route('/api/save', methods=['POST'])
@login_required
def api_save():
    data = request.get_json() or {}
    save = current_user.save
    if not save:
        save = GameSave(user_id=current_user.id)
        db.session.add(save)
    
    if 'money' in data:
        save.money = max(0, int(data['money']))
    if 'gems' in data:
        save.gems = max(0, int(data['gems']))
    if 'level' in data:
        save.level = max(1, int(data['level']))
    if 'selected_character' in data:
        save.selected_character = data['selected_character']
    if 'unlocked_characters' in data:
        save.set_unlocked_list(data['unlocked_characters'])
    if 'stats' in data:
        s = data['stats']
        if 'wins' in s:   save.stats_wins = int(s['wins'])
        if 'losses' in s: save.stats_losses = int(s['losses'])
        if 'games' in s:  save.stats_games = int(s['games'])
    
    db.session.commit()
    return jsonify({'success': True})