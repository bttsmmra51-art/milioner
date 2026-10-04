# cleanup.py
import sqlite3
import os

candidates = ['instance/game.db', 'game.db']
db_path = None
for c in candidates:
    if os.path.exists(c):
        db_path = c
        break

if not db_path:
    print("❌ مش لاقي game.db")
    exit(1)

print(f"📂 DB: {db_path}")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# اقفل كل الغرف
cur.execute("UPDATE rooms SET status='closed' WHERE status IN ('waiting','playing')")
print(f"✅ اتقفل {cur.rowcount} غرفة")

# امسح الأعضاء
cur.execute("DELETE FROM room_members")
print(f"✅ اتمسح {cur.rowcount} عضو")

# امسح الدعوات
cur.execute("DELETE FROM room_invites WHERE status='pending'")
print(f"✅ اتمسح {cur.rowcount} دعوة")

conn.commit()
conn.close()
print("🎉 خلص")