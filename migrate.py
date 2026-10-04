# migrate.py
import sqlite3
import os

# دور على ملف قاعدة البيانات في الأماكن المحتملة
candidates = [
    'instance/game.db',
    'game.db',
    os.path.join(os.path.dirname(__file__), 'instance', 'game.db'),
]

db_path = None
for c in candidates:
    if os.path.exists(c):
        db_path = c
        break

if not db_path:
    print("❌ مش لاقي game.db — اتأكد إن المشروع في المكان الصح")
    exit(1)

print(f"📂 DB: {db_path}")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# ==========================================
# 1) جدول rooms → إضافة bots_data
# ==========================================
cur.execute("PRAGMA table_info(rooms)")
rooms_cols = [row[1] for row in cur.fetchall()]
print(f"📋 أعمدة rooms الحالية: {rooms_cols}")

if 'bots_data' in rooms_cols:
    print("✅ عمود bots_data موجود بالفعل في rooms")
else:
    try:
        cur.execute("ALTER TABLE rooms ADD COLUMN bots_data TEXT DEFAULT '[]'")
        conn.commit()
        print("✅ تم إضافة عمود bots_data إلى rooms")
    except Exception as e:
        print(f"❌ فشل إضافة bots_data: {e}")
        conn.close()
        exit(1)

# ==========================================
# 2) جدول room_members → إضافة team_idx
# ==========================================
cur.execute("PRAGMA table_info(room_members)")
members_cols = [row[1] for row in cur.fetchall()]
print(f"📋 أعمدة room_members الحالية: {members_cols}")

if 'team_idx' in members_cols:
    print("✅ عمود team_idx موجود بالفعل في room_members")
else:
    try:
        cur.execute("ALTER TABLE room_members ADD COLUMN team_idx INTEGER")
        conn.commit()
        print("✅ تم إضافة عمود team_idx إلى room_members")
    except Exception as e:
        print(f"❌ فشل إضافة team_idx: {e}")
        conn.close()
        exit(1)

# ==========================================
# 3) أي تعديلات مستقبلية هنا
# ==========================================
# مثال: لو أضفت عمود جديد في models.py
# cur.execute("PRAGMA table_info(users)")
# users_cols = [row[1] for row in cur.fetchall()]
# if 'new_column' not in users_cols:
#     cur.execute("ALTER TABLE users ADD COLUMN new_column TYPE DEFAULT ...")
#     conn.commit()
#     print("✅ تم إضافة عمود new_column إلى users")

conn.close()
print("🎉 خلص Migration — مفيش بيانات ضاعت")