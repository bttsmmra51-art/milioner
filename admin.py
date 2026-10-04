# admin.py
from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user
from extensions import db
from models import User, GameSave
from functools import wraps

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


def admin_required(f):
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if not current_user.is_admin:
            abort(403)
        return f(*args, **kwargs)
    return decorated


@admin_bp.route('/')
@admin_required
def dashboard():
    users = User.query.order_by(User.created_at.desc()).all()
    stats = {
        'total_users': User.query.count(),
        'total_admins': User.query.filter_by(is_admin=True).count(),
        'total_banned': User.query.filter_by(is_banned=True).count(),
    }
    return render_template('admin/dashboard.html', users=users, stats=stats)


@admin_bp.route('/api/users')
@admin_required
def api_users():
    """قائمة اللاعبين (JSON)"""
    users = User.query.all()
    result = []
    for u in users:
        s = u.save
        result.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'is_admin': u.is_admin,
            'is_banned': u.is_banned,
            'money': s.money if s else 0,
            'gems': s.gems if s else 0,
            'level': s.level if s else 1,
        })
    return jsonify(result)


@admin_bp.route('/api/user/<int:user_id>')
@admin_required
def api_get_user(user_id):
    user = User.query.get_or_404(user_id)
    save = user.save
    return jsonify({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'is_admin': user.is_admin,
        'is_banned': user.is_banned,
        'money': save.money if save else 0,
        'gems': save.gems if save else 0,
        'level': save.level if save else 1,
        'selected_character': save.selected_character if save else 'sama',
        'unlocked_characters': save.get_unlocked_list() if save else []
    })


@admin_bp.route('/api/user/<int:user_id>/give', methods=['POST'])
@admin_required
def api_give(user_id):
    """إضافة فلوس/جواهر للاعب"""
    user = User.query.get_or_404(user_id)
    save = user.save
    if not save:
        save = GameSave(user_id=user.id)
        db.session.add(save)
    
    data = request.get_json() or {}
    money_add = int(data.get('money', 0))
    gems_add = int(data.get('gems', 0))
    
    save.money = max(0, save.money + money_add)
    save.gems = max(0, save.gems + gems_add)
    
    db.session.commit()
    return jsonify({
        'success': True,
        'new_money': save.money,
        'new_gems': save.gems
    })


@admin_bp.route('/api/user/<int:user_id>/set', methods=['POST'])
@admin_required
def api_set(user_id):
    """تعيين قيم جديدة للاعب"""
    user = User.query.get_or_404(user_id)
    save = user.save
    if not save:
        save = GameSave(user_id=user.id)
        db.session.add(save)
    
    data = request.get_json() or {}
    
    if 'money' in data:  save.money = max(0, int(data['money']))
    if 'gems' in data:   save.gems = max(0, int(data['gems']))
    if 'level' in data:  save.level = max(1, int(data['level']))
    
    if 'is_banned' in data:
        user.is_banned = bool(data['is_banned'])
    if 'is_admin' in data:
        user.is_admin = bool(data['is_admin'])
    if 'unlocked_characters' in data:
        save.set_unlocked_list(data['unlocked_characters'])
    
    db.session.commit()
    return jsonify({'success': True})


@admin_bp.route('/api/user/<int:user_id>/unlock', methods=['POST'])
@admin_required
def api_unlock_character(user_id):
    """فتح شخصية للاعب"""
    user = User.query.get_or_404(user_id)
    save = user.save
    if not save:
        save = GameSave(user_id=user.id)
        db.session.add(save)
    
    data = request.get_json() or {}
    character = data.get('character', '').strip()
    
    if not character:
        return jsonify({'success': False, 'error': 'لم تحدد الشخصية'}), 400
    
    unlocked = save.get_unlocked_list()
    if character not in unlocked:
        unlocked.append(character)
        save.set_unlocked_list(unlocked)
        db.session.commit()
    
    return jsonify({'success': True, 'unlocked': unlocked})


@admin_bp.route('/api/user/<int:user_id>/unlock_all', methods=['POST'])
@admin_required
def api_unlock_all(user_id):
    """فتح كل الشخصيات المتاحة"""
    user = User.query.get_or_404(user_id)
    save = user.save
    if not save:
        save = GameSave(user_id=user.id)
        db.session.add(save)
    
    all_chars = ['sama', 'default', 'karim', 'ahmed', 'mohamed']
    save.set_unlocked_list(all_chars)
    db.session.commit()
    return jsonify({'success': True, 'unlocked': all_chars})