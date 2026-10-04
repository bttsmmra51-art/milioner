# game_state.py
"""
إدارة حالة اللعبة بالكامل على السيرفر.
Server Authoritative - كل المنطق هنا.
"""

import random
import time
from typing import Optional, List, Dict, Any


# ==========================================
# 🗺️ لوحة اللعبة (32 خانة)
# ==========================================
BOARD: List[Dict[str, Any]] = [
    {"index": 0,  "name": "البداية",          "type": "start"},
    {"index": 1,  "name": "فالورا",           "type": "property", "price": 140, "rent": 18,  "upgrade_price": 170},
    {"index": 2,  "name": "مونتيرا",          "type": "property", "price": 160, "rent": 21,  "upgrade_price": 190},
    {"index": 3,  "name": "خزينة المدينة",    "type": "chest"},
    {"index": 4,  "name": "أورفيكا",          "type": "property", "price": 180, "rent": 24,  "upgrade_price": 215},
    {"index": 5,  "name": "ضربة حظ",          "type": "chance"},
    {"index": 6,  "name": "محطة نوفا",         "type": "station",  "price": 150, "rent": 25},
    {"index": 7,  "name": "سيلفارا",           "type": "property", "price": 280, "rent": 40,  "upgrade_price": 340},
    {"index": 8,  "name": "المحطة السوداء",    "type": "jail"},
    {"index": 9,  "name": "إلورا",            "type": "property", "price": 200, "rent": 27,  "upgrade_price": 240},
    {"index": 10, "name": "فيرونا",           "type": "property", "price": 220, "rent": 30,  "upgrade_price": 265},
    {"index": 11, "name": "خزينة المدينة",    "type": "chest"},
    {"index": 12, "name": "أستيرا",           "type": "property", "price": 240, "rent": 33,  "upgrade_price": 290},
    {"index": 13, "name": "كريستال باي",       "type": "property", "price": 260, "rent": 36,  "upgrade_price": 315},
    {"index": 14, "name": "ضربة حظ",          "type": "chance"},
    {"index": 15, "name": "محطة أوربت",        "type": "station",  "price": 150, "rent": 25},
    {"index": 16, "name": "بوابة العالم",      "type": "airport"},
    {"index": 17, "name": "بلاكستون",         "type": "property", "price": 360, "rent": 50,  "upgrade_price": 430},
    {"index": 18, "name": "جولدن ديستريكت",    "type": "property", "price": 380, "rent": 54,  "upgrade_price": 455},
    {"index": 19, "name": "إمبيريا",          "type": "property", "price": 420, "rent": 62,  "upgrade_price": 505},
    {"index": 20, "name": "أوريون",           "type": "property", "price": 660, "rent": 100, "upgrade_price": 770},
    {"index": 21, "name": "كراون سيتي",        "type": "property", "price": 620, "rent": 92,  "upgrade_price": 730},
    {"index": 22, "name": "ضربة حظ",          "type": "chance"},
    {"index": 23, "name": "بقشيش",            "type": "tip",      "amount": 30},
    {"index": 24, "name": "مضاعفة الأرباح",    "type": "double_rent"},
    {"index": 25, "name": "سكاي لاين",         "type": "property", "price": 400, "rent": 58,  "upgrade_price": 480},
    {"index": 26, "name": "رويال أفينيو",      "type": "property", "price": 320, "rent": 45,  "upgrade_price": 385},
    {"index": 27, "name": "خزينة المدينة",    "type": "chest"},
    {"index": 28, "name": "ستارلايت",          "type": "property", "price": 550, "rent": 80,  "upgrade_price": 650},
    {"index": 29, "name": "ميرافا",           "type": "property", "price": 700, "rent": 108, "upgrade_price": 820},
    {"index": 30, "name": "فيلورا",           "type": "property", "price": 450, "rent": 67,  "upgrade_price": 540},
    {"index": 31, "name": "محطة أسترا",        "type": "station",  "price": 150, "rent": 25},
]


# ==========================================
# 🎴 بطاقات الحظ
# ==========================================
CHANCE_CARDS: List[Dict[str, Any]] = [
    {"id": "gain_100",  "name": "بقشيش",         "icon": "💵", "text": "احصل على 100$",           "type": "reward",     "effect": "gain_bank",     "amount": 100},
    {"id": "gain_200",  "name": "مكافأة",         "icon": "💰", "text": "احصل على 200$",           "type": "reward",     "effect": "gain_bank",     "amount": 200},
    {"id": "gain_500",  "name": "جوائز كبرى",     "icon": "🎉", "text": "احصل على 500$",           "type": "reward",     "effect": "gain_bank",     "amount": 500},
    {"id": "pay_150",   "name": "خسارة",          "icon": "💸", "text": "اخسر 150$",                "type": "loss",       "effect": "pay_bank",      "amount": 150},
    {"id": "pay_300",   "name": "ضرائب",          "icon": "📋", "text": "اخسر 300$",                "type": "loss",       "effect": "pay_bank",      "amount": 300},
    {"id": "pay_500",   "name": "غرامة",          "icon": "⚠️", "text": "اخسر 500$",                "type": "loss",       "effect": "pay_bank",      "amount": 500},
    {"id": "fwd_3",     "name": "تقدم",           "icon": "🚀", "text": "تقدم 3 خانات",            "type": "move",       "effect": "move_forward",  "steps": 3},
    {"id": "fwd_5",     "name": "انطلاق",         "icon": "🚀", "text": "تقدم 5 خانات",            "type": "move",       "effect": "move_forward",  "steps": 5},
    {"id": "fwd_12",    "name": "صاروخ",          "icon": "🚀", "text": "تقدم 12 خانة",            "type": "move",       "effect": "move_forward",  "steps": 12},
    {"id": "back_3",    "name": "تراجع",          "icon": "⬅️", "text": "ارجع 3 خانات",            "type": "move",       "effect": "move_backward", "steps": 3},
    {"id": "back_start","name": "عد للبداية",     "icon": "🏁", "text": "ارجع للبداية وخذ 250$",   "type": "move",       "effect": "back_to_start"},
    {"id": "go_jail",   "name": "المحطة السوداء", "icon": "💀", "text": "اذهب للمحطة السوداء",      "type": "loss",       "effect": "go_jail"},
    {"id": "go_airport","name": "بوابة العالم",   "icon": "✈️", "text": "اذهب لبوابة العالم",       "type": "move",       "effect": "go_airport"},
    {"id": "tp_rand",   "name": "هروب مفاجئ",     "icon": "🌀", "text": "انتقل لمكان عشوائي",       "type": "move",       "effect": "teleport_random"},
    {"id": "dbl_rent",  "name": "الإيجار المضاعف", "icon": "💵", "text": "كل عقاراتك إيجارها ×2",   "type": "reward",     "effect": "double_rent_all"},
    {"id": "smart_rent","name": "المستأجر الذكي", "icon": "🏦", "text": "استلم مجموع إيجاراتك",    "type": "reward",     "effect": "smart_tenant"},
    {"id": "dice_dbl",  "name": "قوة النرد",      "icon": "🎲", "text": "النرد التالي ×2",          "type": "strategic",  "effect": "dice_double"},
    {"id": "half_their","name": "نصف ثروتهم",     "icon": "💰", "text": "كل لاعب يدفعلك 50%",      "type": "reward",     "effect": "half_their_wealth"},
    {"id": "half_your", "name": "نصف ثروتك",      "icon": "💸", "text": "وزع 50% من ثروتك",        "type": "loss",       "effect": "half_your_wealth"},
    {"id": "swap_rand", "name": "مقايضة",         "icon": "🔀", "text": "بدل مكانك مع لاعب عشوائي","type": "interactive","effect": "swap_places_random"},
]


# ==========================================
# 👤 اللاعب
# ==========================================
class Player:
    def __init__(self, user_id, username, character="sama", is_bot=False, bot_index=None):
        self.user_id = user_id
        self.username = username
        self.character = character
        self.is_bot = is_bot
        self.bot_index = bot_index
        self.money = 1000
        self.position = 0
        self.alive = True
        self.jail_turns = 0
        self.skip_next_turn = False
        self.airport_visits = 0
        self.airport_pending = False
        self._start_laps = 0
        self._dice_double_next = False

    def to_dict(self, team_idx=None):
        return {
            "user_id": self.user_id,
            "username": self.username,
            "character": self.character,
            "is_bot": self.is_bot,
            "bot_index": self.bot_index,
            "money": self.money,
            "position": self.position,
            "alive": self.alive,
            "jail_turns": self.jail_turns,
            "airport_pending": self.airport_pending,
            "team_idx": team_idx,
        }


# ==========================================
# 🎮 حالة اللعبة
# ==========================================
class GameState:
    def __init__(self, room_id, mode, players):
        self.room_id = room_id
        self.mode = mode
        self.players = players

        self.current_turn_idx = 0
        self.consecutive_doubles = 0

        self.dice = [None, None]
        self.dice_rolled = False
        self.awaiting_roll = True
        self.awaiting_move_done = False
        self.awaiting_decision = None
        self.pending_chance_card = None
        self.last_move_path = []

        self.board = [dict(t) for t in BOARD]
        for tile in self.board:
            if tile["type"] in ("property", "station"):
                tile["owner"] = None
                tile["level"] = None
                if tile["type"] == "property":
                    tile["rent_multiplier"] = 1

        self.status = "playing"
        self.winner = None
        self.ended_reason = None
        self.created_at = time.time()
        self.last_action_at = time.time()
        self.event_log = []

        # ✅ RPS + turn_order
        self.phase = 'rps'
        self.rps_choices = {}
        self.rps_result = None
        self.starting_order = []
        self.turn_order = [p.user_id for p in players]
        # ✅ مؤقت اللعبة
        self.game_duration = 1200  # 20 دقيقة بالثواني
        self.started_at = None
                # ✅ RPS tiebreak
        self.rps_round = 1
        self.rps_active_ids = [p.user_id for p in players if p.alive]
        self._rps_remaining_after_tie = []

    def is_teammate(self, player_a, user_id_b):
        if self.mode != "2v2":
            return False
        if user_id_b is None:
            return False
        p_b = self.get_player_by_user_id(user_id_b)
        if not p_b:
            return False
        try:
            idx_a = self.players.index(player_a)
            idx_b = self.players.index(p_b)
        except ValueError:
            return False
        return (idx_a // 2) == (idx_b // 2)

    def current_player(self):
        return self.players[self.current_turn_idx]

    def get_player_by_user_id(self, user_id):
        if user_id is None:
            return None
        for p in self.players:
            if p.user_id == user_id:
                return p
        return None

    def alive_players(self):
        return [p for p in self.players if p.alive]

    def _log(self, msg):
        self.event_log.append(msg)
        if len(self.event_log) > 200:
            self.event_log = self.event_log[-200:]

    def _owner_team_idx(self, owner_user_id):
        if owner_user_id is None:
            return None
        for i, p in enumerate(self.players):
            if p.user_id == owner_user_id:
                return i // 2
        return None

    # -------- RPS --------
    def submit_rps_choice(self, user_id, choice):
        if self.phase != 'rps':
            return {'error': 'مش وقت حجر ورقة مقص'}
        if choice not in ('rock', 'paper', 'scissors'):
            return {'error': 'اختيار غير صالح'}

        player = self.get_player_by_user_id(user_id)
        if not player or not player.alive:
            return {'error': 'لاعب غير موجود'}

        if user_id not in self.rps_active_ids:
            return {'error': 'مش دورك في هذه الجولة'}

        if user_id in self.rps_choices:
            return {'error': 'اخترت بالفعل'}

        self.rps_choices[user_id] = choice

        active = [p for p in self.players if p.alive and p.user_id in self.rps_active_ids]
        if len(self.rps_choices) >= len(active):
            outcome = self._resolve_rps()
            if outcome == 'tie':
                return {
                    'ok': True,
                    'tiebreak': True,
                    'tied_ids': list(self.rps_active_ids),
                    'round': self.rps_round,
                }
            return {'ok': True, 'all_chosen': True}

        return {
            'ok': True,
            'all_chosen': False,
            'chosen': len(self.rps_choices),
            'total': len(active),
        }
    def _resolve_rps(self):
        active = [p for p in self.players if p.alive and p.user_id in self.rps_active_ids]
        choices = self.rps_choices

        beats = {'rock': 'scissors', 'paper': 'rock', 'scissors': 'paper'}
        scores = {p.user_id: 0 for p in active}

        for i, a in enumerate(active):
            for b in active[i + 1:]:
                ca = choices.get(a.user_id)
                cb = choices.get(b.user_id)
                if not ca or not cb or ca == cb:
                    continue
                if beats.get(ca) == cb:
                    scores[a.user_id] += 1
                else:
                    scores[b.user_id] += 1

        ordered = sorted(active, key=lambda p: (-scores[p.user_id], p.user_id))

        top_score = scores[ordered[0].user_id]
        tied = [p for p in ordered if scores[p.user_id] == top_score]
        below = [p for p in ordered if scores[p.user_id] != top_score]

        # ✅ تعادل بين اتنين أو أكتر
        if len(tied) > 1:
            self._rps_remaining_after_tie = [p.user_id for p in below] + list(self._rps_remaining_after_tie)
            self.rps_active_ids = [p.user_id for p in tied]
            self.rps_choices = {}
            self.rps_round += 1
            print(f'⚖️ RPS Tie in round {self.rps_round - 1} — redo between {[p.username for p in tied]}')
            return 'tie'

        # ✅ مفيش تعادل — نبني الترتيب النهائي
        final_uids = [p.user_id for p in ordered] + list(self._rps_remaining_after_tie)
        self._rps_remaining_after_tie = []

        final_players = []
        for uid in final_uids:
            for p in self.players:
                if p.user_id == uid:
                    final_players.append(p)
                    break

        self.starting_order = [p.user_id for p in final_players]
        self.rps_result = {
            'choices': dict(choices),
            'scores': scores,
            'round': self.rps_round,
            'order': [
                {
                    'user_id': p.user_id,
                    'username': p.username,
                    'score': scores.get(p.user_id, 0),
                    'choice': choices.get(p.user_id),
                    'is_bot': p.is_bot,
                }
                for p in final_players
            ],
        }
        return 'ok'
    
    def apply_rps_start(self):
        if self.phase != 'rps':
            return {'error': 'مش وقت RPS'}
        if not self.starting_order:
            return {'error': 'RPS لسه مخلصش'}

        self.turn_order = list(self.starting_order)

        first_uid = self.starting_order[0]
        for i, p in enumerate(self.players):
            if p.user_id == first_uid:
                self.current_turn_idx = i
                break

        self.phase = 'playing'
        self.awaiting_roll = True
        self.awaiting_decision = None
        self.pending_chance_card = None
        self.dice_rolled = False
        self.consecutive_doubles = 0
        self.started_at = time.time()
        return {'ok': True}

    # -------- Passives --------
    def apply_kiro_rebound(self, player, amount, result):
        if player.character != "kiro" or amount <= 0:
            return
        if random.random() < 0.70:
            refund = int(amount * 0.7)
            if refund > 0:
                player.money += refund
                ev = {
                    "from_user_id": None,
                    "to_user_id": player.user_id,
                    "amount": refund,
                    "from_is_bank": True,
                    "to_is_bank": False,
                    "kiro_rebound": True,
                }
                result.setdefault("money_events", []).append(ev)
                result.setdefault("passive_triggers", []).append({
                    "player_idx": self.players.index(player),
                    "player_user_id": player.user_id,
                    "icon": "🔄",
                    "name": "الارتداد",
                    "amount": refund,
                })

    # -------- Money --------
    def transfer_money(self, from_id, to_id, amount):
        if amount <= 0:
            return None
        from_p = self.get_player_by_user_id(from_id) if from_id is not None else None
        to_p = self.get_player_by_user_id(to_id) if to_id is not None else None
        if from_p:
            from_p.money -= amount
        if to_p:
            to_p.money += amount
        return {
            "from_user_id": from_id,
            "to_user_id": to_id,
            "amount": amount,
            "from_is_bank": from_id is None,
            "to_is_bank": to_id is None,
        }

    # -------- Dice --------
    def roll_dice(self, user_id, is_bot=False):
        if self.status != "playing":
            return {"error": "اللعبة منتهية"}
        if self.phase != 'playing':
            return {"error": "اللعبة لسه بتبدأ"}
        if not self.awaiting_roll:
            return {"error": "استنى دورك"}
        if self.awaiting_decision or self.pending_chance_card:
            return {"error": "في قرار معلق"}

        current = self.current_player()

        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not current.alive:
            return {"error": "أنت خارج اللعبة"}
        if current.jail_turns > 0:
            return {"error": "أنت في المحطة السوداء"}

        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        total = d1 + d2
        is_double = (d1 == d2)

        multiplier = 1
        if current._dice_double_next:
            multiplier = 2
            current._dice_double_next = False
        total *= multiplier

        if is_double:
            self.consecutive_doubles += 1
        else:
            self.consecutive_doubles = 0

        if self.consecutive_doubles >= 3:
            self.consecutive_doubles = 0
            self.dice = [d1, d2]
            self.dice_rolled = True
            self.awaiting_roll = False
            self.awaiting_move_done = False

            if current.character == "sama" and random.random() < 0.75:
                current.position = 16
                current.airport_visits = (current.airport_visits or 0) + 1
                current.airport_pending = True
                self.awaiting_decision = {"type": "airport", "player_idx": self.current_turn_idx}

                bonus = 100 * current.airport_visits
                ev = self.transfer_money(None, current.user_id, bonus)
                money_events = [ev] if ev else []

                return {
                    "d1": d1, "d2": d2, "total": total,
                    "is_double": True,
                    "consecutive_doubles": 0,
                    "dice_multiplier": multiplier,
                    "player_index": self.current_turn_idx,
                    "player_username": current.username,
                    "path": [],
                    "event": "sama_wings",
                    "money_events": money_events,
                    "passive_triggers": [
                        {"player_idx": self.current_turn_idx, "icon": "🪽", "name": "أجنحة الحرية"},
                        {"player_idx": self.current_turn_idx, "icon": "💼", "name": "خدمة الضيوف", "amount": bonus},
                    ],
                }

            current.position = 8
            current.jail_turns = 2
            return {
                "d1": d1, "d2": d2, "total": total,
                "is_double": True,
                "consecutive_doubles": 0,
                "dice_multiplier": multiplier,
                "player_index": self.current_turn_idx,
                "player_username": current.username,
                "path": [],
                "event": "three_doubles_jail",
            }

        self.dice = [d1, d2]
        self.dice_rolled = True
        self.awaiting_roll = False
        self.awaiting_move_done = True
        self.last_action_at = time.time()

        path = self._compute_path(total)
        self.last_move_path = path

        return {
            "d1": d1,
            "d2": d2,
            "total": total,
            "is_double": is_double,
            "consecutive_doubles": self.consecutive_doubles,
            "dice_multiplier": multiplier,
            "player_index": self.current_turn_idx,
            "player_username": current.username,
            "path": path,
        }

    def _compute_path(self, steps):
        current_pos = self.current_player().position
        n = len(self.board)
        path = []
        for i in range(1, steps + 1):
            path.append((current_pos + i) % n)
        return path

    def _compute_path_backward(self, steps):
        current_pos = self.current_player().position
        n = len(self.board)
        path = []
        for i in range(1, steps + 1):
            path.append((current_pos - i) % n)
        return path

    # -------- Movement --------
    def mark_move_done(self, user_id, is_bot=False):
        if not self.awaiting_move_done:
            return {"error": "مفيش حركة جارية"}
        current = self.current_player()

        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        self.awaiting_move_done = False

        path = self.last_move_path or []
        money_events = []
        player = current

        for tile_idx in path:
            old_pos = player.position
            if tile_idx == 0 and old_pos != 0:
                player._start_laps += 1
                ev = self.transfer_money(None, player.user_id, 250)
                if ev:
                    money_events.append(ev)
            player.position = tile_idx

        self.last_move_path = []
        self.last_action_at = time.time()

        return {
            "ok": True,
            "money_events": money_events,
            "final_position": player.position,
        }

    # -------- Landing --------
    def resolve_landing(self, user_id, is_bot=False):
        if self.status != "playing":
            return {"error": "اللعبة منتهية"}

        current = self.current_player()

        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        tile = self.board[current.position]
        ttype = tile["type"]

        result = {
            "tile_index": current.position,
            "tile_name": tile["name"],
            "tile_type": ttype,
            "player_idx": self.current_turn_idx,
            "player_username": current.username,
            "money_events": [],
            "passive_triggers": [],
        }

        if current.money <= 0:
            self._bankrupt(current)
            result["event"] = "bankrupt"
            return result

        if ttype == "start":
            houses = [
                t for t in self.board
                if t.get("owner") == current.user_id
                and t["type"] == "property"
                and t.get("level") == "house"
            ]
            if houses:
                self.awaiting_decision = {
                    "type": "free_upgrade",
                    "player_idx": self.current_turn_idx,
                    "owned_indices": [t["index"] for t in houses],
                }
                result["event"] = "free_upgrade_offer"
                result["owned_indices"] = [t["index"] for t in houses]
                return result
            result["event"] = "nothing"
            return result

        if ttype == "tip":
            ev = self.transfer_money(None, current.user_id, tile["amount"])
            result["event"] = "money_gain"
            if ev:
                result["money_events"].append(ev)
            result["amount"] = tile["amount"]
            return result

        if ttype == "chest":
            reward = random.randint(75, 500)
            ev = self.transfer_money(None, current.user_id, reward)
            result["event"] = "chest"
            if ev:
                result["money_events"].append(ev)
            result["amount"] = reward
            return result

        if ttype == "chance":
            card = random.choice(CHANCE_CARDS)
            if current.character == "kiro" and random.random() < 0.35:
                self.pending_chance_card = {"card": card, "stage": "plan"}
                self.awaiting_decision = {"type": "plan_choice", "card": card}
                result["event"] = "plan_offer"
                result["card"] = card
                return result

            self.pending_chance_card = {"card": card}
            self.awaiting_decision = {"type": "chance", "card": card}
            result["event"] = "chance"
            result["card"] = card
            return result

        if ttype == "double_rent":
            owned = [t for t in self.board if t["type"] == "property" and t["owner"] == current.user_id]
            if not owned:
                result["event"] = "nothing"
                result["message"] = "لا تملك عقارات"
                return result
            self.awaiting_decision = {
                "type": "double_rent",
                "player_idx": self.current_turn_idx,
                "owned_indices": [t["index"] for t in owned],
            }
            result["event"] = "double_rent_offer"
            result["owned_indices"] = [t["index"] for t in owned]
            return result

        if ttype == "jail":
            current.jail_turns = 2
            result["event"] = "jail"
            return result

        if ttype == "airport":
            current.airport_visits = (current.airport_visits or 0) + 1

            if current.character == "sama":
                bonus = 100 * current.airport_visits
                ev = self.transfer_money(None, current.user_id, bonus)
                if ev:
                    result["money_events"].append(ev)
                result["passive_triggers"].append({
                    "player_idx": self.current_turn_idx,
                    "icon": "💼",
                    "name": "خدمة الضيوف",
                    "amount": bonus,
                })
                result["bonus_amount"] = bonus

            current.airport_pending = True
            self.awaiting_decision = {"type": "airport", "player_idx": self.current_turn_idx}
            result["event"] = "airport_offer"
            return result

        if ttype in ("property", "station"):
            owner_id = tile.get("owner")

            if owner_id is None:
                if current.money >= tile["price"]:
                    self.awaiting_decision = {"type": "buy", "tile_index": tile["index"]}
                    result["event"] = "buy_offer"
                    result["price"] = tile["price"]
                else:
                    result["event"] = "nothing"
                    result["message"] = "لا تملك مالاً كافياً"
                return result

            if owner_id == current.user_id or self.is_teammate(current, owner_id):
                if tile["type"] == "property" and tile["level"] == "house":
                    up_price = tile.get("upgrade_price", tile["price"] * 3 // 2)
                    if current.money >= up_price:
                        self.awaiting_decision = {"type": "upgrade", "tile_index": tile["index"]}
                        result["event"] = "upgrade_offer"
                        result["price"] = up_price
                        result["is_teammate_property"] = (owner_id != current.user_id)
                        return result
                result["event"] = "nothing"
                if owner_id == current.user_id:
                    result["message"] = "أنت تملك هذه الخانة"
                else:
                    result["message"] = "عقار زميلك في الفريق"
                return result
            owner = self.get_player_by_user_id(owner_id)
            rent = self._rent_for(tile)

            if current.money < rent:
                paid = current.money
                ev = self.transfer_money(current.user_id, owner_id, paid)
                if ev:
                    result["money_events"].append(ev)
                self.apply_kiro_rebound(current, paid, result)
                self._bankrupt(current)
                result["event"] = "bankrupt"
                return result

            ev = self.transfer_money(current.user_id, owner_id, rent)
            result["event"] = "rent"
            if ev:
                result["money_events"].append(ev)
            result["rent"] = rent
            result["owner_username"] = owner.username if owner else "?"
            result["owner_user_id"] = owner_id

            self.apply_kiro_rebound(current, rent, result)

            if tile["type"] == "property" and tile["level"] == "house":
                steal_price = int(tile["price"] * 1.5)
                if current.money >= steal_price:
                    self.awaiting_decision = {"type": "steal", "tile_index": tile["index"], "owner_id": owner_id}
                    result["event"] = "steal_offer"
                    result["steal_price"] = steal_price
            return result

        result["event"] = "nothing"
        return result

    def _rent_for(self, tile):
        base = tile.get("rent", 0)
        level = tile.get("level")
        if level == "house":
            base *= 2
        elif level == "building":
            base *= 4
        return base * tile.get("rent_multiplier", 1)

    # -------- Decisions --------
    def apply_buy(self, user_id, tile_index, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not self.awaiting_decision or self.awaiting_decision.get("type") != "buy":
            return {"error": "مفيش عرض شراء"}
        if self.awaiting_decision.get("tile_index") != tile_index:
            return {"error": "خانة خطأ"}

        tile = self.board[tile_index]
        if current.money < tile["price"]:
            return {"error": "مال غير كافي"}

        ev = self.transfer_money(current.user_id, None, tile["price"])
        tile["owner"] = current.user_id
        if tile["type"] == "property":
            tile["level"] = "house"
            tile["rent_multiplier"] = 1
        else:
            tile["level"] = None
        self.awaiting_decision = None

        result = {"ok": True, "money_events": [ev] if ev else [], "passive_triggers": []}
        self.apply_kiro_rebound(current, tile["price"], result)
        return result

    def apply_skip(self, user_id, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}
        self.awaiting_decision = None
        return {"ok": True, "money_events": [], "passive_triggers": []}

    def apply_upgrade(self, user_id, tile_index, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not self.awaiting_decision or self.awaiting_decision.get("type") != "upgrade":
            return {"error": "مفيش عرض ترقية"}
        if self.awaiting_decision.get("tile_index") != tile_index:
            return {"error": "خانة خطأ"}

        tile = self.board[tile_index]

        is_owner = tile.get("owner") == current.user_id
        is_teammate_owner = self.is_teammate(current, tile.get("owner"))

        if not (is_owner or is_teammate_owner) or tile.get("level") != "house":
            return {"error": "مش قابل للترقية"}

        up_price = tile.get("upgrade_price", tile["price"] * 3 // 2)

        if current.money < up_price:
            return {"error": "مال غير كافي"}

        ev = self.transfer_money(current.user_id, None, up_price)
        tile["level"] = "building"
        self.awaiting_decision = None

        result = {"ok": True, "money_events": [ev] if ev else [], "passive_triggers": []}
        self.apply_kiro_rebound(current, up_price, result)
        return result

    def apply_steal(self, user_id, tile_index, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not self.awaiting_decision or self.awaiting_decision.get("type") != "steal":
            return {"error": "مفيش عرض شراء"}
        if self.awaiting_decision.get("tile_index") != tile_index:
            return {"error": "خانة خطأ"}

        tile = self.board[tile_index]
        owner_id = self.awaiting_decision.get("owner_id")
        steal_price = int(tile["price"] * 1.5)
        if current.money < steal_price:
            return {"error": "مال غير كافي"}

        ev = self.transfer_money(current.user_id, owner_id, steal_price)
        tile["owner"] = current.user_id
        tile["rent_multiplier"] = 1
        self.awaiting_decision = None

        result = {"ok": True, "money_events": [ev] if ev else [], "passive_triggers": []}
        self.apply_kiro_rebound(current, steal_price, result)
        return result

    def apply_free_upgrade(self, user_id, tile_index, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not self.awaiting_decision or self.awaiting_decision.get("type") != "free_upgrade":
            return {"error": "مفيش عرض ترقية مجانية"}

        tile = self.board[tile_index]
        if tile.get("owner") != current.user_id:
            return {"error": "مش عقارك"}
        if tile["type"] != "property" or tile.get("level") != "house":
            return {"error": "مش قابل للترقية"}

        tile["level"] = "building"
        self.awaiting_decision = None

        return {
            "ok": True,
            "tile_index": tile_index,
            "tile_name": tile["name"],
            "money_events": [],
            "passive_triggers": [],
        }

    def apply_airport_choice(self, user_id, tile_index, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not self.awaiting_decision or self.awaiting_decision.get("type") != "airport":
            return {"error": "مفيش اختيار مطار"}
        if tile_index < 0 or tile_index >= len(self.board):
            return {"error": "خانة خطأ"}
        if tile_index == 16:
            return {"error": "لا يمكن اختيار المطار نفسه"}

        current.airport_pending = False
        self.awaiting_decision = None

        start = current.position
        n = len(self.board)
        path = []
        pos = start
        while True:
            pos = (pos + 1) % n
            path.append(pos)
            if pos == tile_index:
                break
            if len(path) > n:
                break

        self.last_move_path = path
        self.awaiting_move_done = True

        return {
            "ok": True,
            "player_idx": self.current_turn_idx,
            "animation_path": path,
            "target_index": tile_index,
            "money_events": [],
            "passive_triggers": [],
        }

    def apply_double_rent_choice(self, user_id, tile_index, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not self.awaiting_decision or self.awaiting_decision.get("type") != "double_rent":
            return {"error": "مفيش اختيار مضاعفة"}

        tile = self.board[tile_index]
        if tile.get("owner") != current.user_id:
            return {"error": "مش عقارك"}
        if tile["type"] != "property":
            return {"error": "مش عقار"}

        tile["rent_multiplier"] = tile.get("rent_multiplier", 1) * 2
        self.awaiting_decision = None

        return {
            "ok": True,
            "doubled_tile_index": tile_index,
            "doubled_tile_name": tile["name"],
            "new_multiplier": tile["rent_multiplier"],
            "money_events": [],
            "passive_triggers": [],
        }

    def apply_plan_choice(self, user_id, accept, is_bot=False):
        current = self.current_player()
        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        if not self.awaiting_decision or self.awaiting_decision.get("type") != "plan_choice":
            return {"error": "مفيش اختيار خطة"}

        original_card = self.pending_chance_card.get("card") if self.pending_chance_card else None

        if accept:
            self.pending_chance_card = {"card": original_card}
            self.awaiting_decision = {"type": "chance", "card": original_card}
            return {
                "ok": True,
                "action": "accept",
                "card": original_card,
                "passive_triggers": [],
            }
        else:
            new_card = random.choice(CHANCE_CARDS)
            self.pending_chance_card = {"card": new_card}
            self.awaiting_decision = {"type": "chance", "card": new_card}
            return {
                "ok": True,
                "action": "redraw",
                "old_card": original_card,
                "card": new_card,
                "passive_triggers": [
                    {"player_idx": self.current_turn_idx, "icon": "📋", "name": "لدي خطة"},
                ],
            }

    # -------- Chance Cards --------
    def resolve_chance_continue(self, user_id, is_bot=False):
        if not self.pending_chance_card:
            return {"error": "مفيش بطاقة"}
        current = self.current_player()

        if is_bot:
            if not current.is_bot:
                return {"error": "مش دور بوت"}
        else:
            if current.user_id != user_id:
                return {"error": "مش دورك"}

        card = self.pending_chance_card["card"]
        self.pending_chance_card = None
        self.awaiting_decision = None

        effect = card["effect"]
        money_events = []
        animation_path = []
        extra = {}
        passive_triggers = []

        if effect == "gain_bank":
            ev = self.transfer_money(None, current.user_id, card["amount"])
            if ev:
                money_events.append(ev)

        elif effect == "pay_bank":
            amt = min(card["amount"], current.money)
            ev = self.transfer_money(current.user_id, None, amt)
            if ev:
                money_events.append(ev)
            temp = {"money_events": money_events, "passive_triggers": passive_triggers}
            self.apply_kiro_rebound(current, amt, temp)
            money_events = temp["money_events"]
            passive_triggers = temp["passive_triggers"]
            if current.money <= 0:
                self._bankrupt(current)

        elif effect == "move_forward":
            path = self._compute_path(card["steps"])
            self.last_move_path = path
            self.awaiting_move_done = True
            animation_path = path

        elif effect == "move_backward":
            path = self._compute_path_backward(card["steps"])
            self.last_move_path = path
            self.awaiting_move_done = True
            animation_path = path

        elif effect == "back_to_start":
            old = current.position
            if old != 0:
                current._start_laps += 1
            current.position = 0
            ev = self.transfer_money(None, current.user_id, 250)
            if ev:
                money_events.append(ev)
            extra["teleport_to"] = 0

        elif effect == "go_jail":
            current.position = 8
            current.jail_turns = 2
            extra["teleport_to"] = 8

        elif effect == "go_airport":
            current.position = 16
            current.airport_pending = True
            extra["teleport_to"] = 16
            self.awaiting_decision = {"type": "airport", "player_idx": self.current_turn_idx}

        elif effect == "teleport_random":
            new_pos = random.randint(0, len(self.board) - 1)
            current.position = new_pos
            extra["teleport_to"] = new_pos

        elif effect == "swap_places_random":
            others = [p for p in self.players if p.alive and p.user_id != current.user_id]
            if others:
                target = random.choice(others)
                tmp = current.position
                current.position = target.position
                target.position = tmp
                extra["swapped_with"] = target.username

        elif effect == "double_rent_all":
            owned = [t for t in self.board if t["type"] == "property" and t["owner"] == current.user_id]
            for t in owned:
                t["rent_multiplier"] = t.get("rent_multiplier", 1) * 2
            extra["doubled_count"] = len(owned)

        elif effect == "smart_tenant":
            owned = [t for t in self.board if t["type"] == "property" and t["owner"] == current.user_id]
            total = sum(self._rent_for(t) for t in owned)
            if total > 0:
                ev = self.transfer_money(None, current.user_id, total)
                if ev:
                    money_events.append(ev)
                extra["amount"] = total

        elif effect == "dice_double":
            current._dice_double_next = True

        elif effect == "half_their_wealth":
            others = [p for p in self.players if p.alive and p.user_id != current.user_id]
            for other in others:
                half = other.money // 2
                if half > 0:
                    ev = self.transfer_money(other.user_id, current.user_id, half)
                    if ev:
                        money_events.append(ev)

        elif effect == "half_your_wealth":
            others = [p for p in self.players if p.alive and p.user_id != current.user_id]
            if others:
                half = current.money // 2
                share = half // len(others)
                if share > 0:
                    for other in others:
                        ev = self.transfer_money(current.user_id, other.user_id, share)
                        if ev:
                            money_events.append(ev)

        self.last_action_at = time.time()
        return {
            "ok": True,
            "player_idx": self.current_turn_idx,
            "effect": effect,
            "money_events": money_events,
            "animation_path": animation_path,
            "extra": extra,
            "passive_triggers": passive_triggers,
        }

    # -------- Bankruptcy --------
    def _bankrupt(self, player):
        player.money = 0
        player.alive = False
        for tile in self.board:
            if tile.get("owner") == player.user_id:
                tile["owner"] = None
                tile["level"] = None
                if tile["type"] == "property":
                    tile["rent_multiplier"] = 1
        self._log(f"{player.username} أفلس")

    # -------- Turn --------
    def _next_turn_idx(self, current_idx):
        if not self.turn_order:
            return (current_idx + 1) % len(self.players)

        current_uid = self.players[current_idx].user_id
        try:
            pos = self.turn_order.index(current_uid)
        except ValueError:
            return (current_idx + 1) % len(self.players)

        n = len(self.turn_order)
        for offset in range(1, n + 1):
            next_pos = (pos + offset) % n
            next_uid = self.turn_order[next_pos]
            for i, p in enumerate(self.players):
                if p.user_id == next_uid:
                    return i
        return (current_idx + 1) % len(self.players)

    def advance_turn(self):
        n = len(self.players)
        found = False

        for _ in range(n * 3):
            self.current_turn_idx = self._next_turn_idx(self.current_turn_idx)
            p = self.current_player()

            if not p.alive:
                continue

            if p.skip_next_turn:
                p.skip_next_turn = False
                continue

            if p.jail_turns > 0:
                p.jail_turns -= 1
                self._log(f"{p.username} في السجن (باقي {p.jail_turns})")
                if p.jail_turns > 0:
                    continue
                found = True
                break

            found = True
            break

        if not found:
            self._log("⚠️ كل اللاعبين في السجن — تخفيض جماعي")
            for p in self.players:
                if p.alive and p.jail_turns > 0:
                    p.jail_turns -= 1
            cur = self.current_player()
            cur.jail_turns = 0

        self.dice = [None, None]
        self.dice_rolled = False
        self.awaiting_roll = True
        self.awaiting_move_done = False
        self.awaiting_decision = None
        self.pending_chance_card = None
        self.consecutive_doubles = 0
        self.last_action_at = time.time()

        return {"ok": True, "current_turn_idx": self.current_turn_idx}

    # -------- Timer --------
    def time_remaining(self):
        if not self.started_at:
            return self.game_duration
        elapsed = time.time() - self.started_at
        return max(0, int(self.game_duration - elapsed))

    def check_time_up(self):
        if self.phase != 'playing' or not self.started_at:
            return None
        if self.time_remaining() > 0:
            return None

        alive = [p for p in self.players if p.alive]
        if not alive:
            return None

        richest = max(alive, key=lambda p: p.money)
        self.status = 'ended'
        self.phase = 'ended'
        self.winner = richest.user_id
        self.ended_reason = f"انتهى الوقت — {richest.username} الأغنى بـ {richest.money}$"

        return {
            'winner_user_id': richest.user_id,
            'winner_username': richest.username,
            'reason': self.ended_reason,
        }

    def surrender(self, user_id):
        player = self.get_player_by_user_id(user_id)
        if not player or not player.alive:
            return {'error': 'لاعب غير موجود'}
        if self.phase != 'playing':
            return {'error': 'اللعبة لسه بتبدأ'}

        was_current = (self.current_player().user_id == user_id)

        player.alive = False
        player.money = 0

        for tile in self.board:
            if tile.get('owner') == user_id:
                tile['owner'] = None
                tile['level'] = None
                if tile['type'] == 'property':
                    tile['rent_multiplier'] = 1

        self._log(f"{player.username} انسحب")

        if was_current:
            self.awaiting_decision = None
            self.awaiting_move_done = False
            self.pending_chance_card = None
            self.advance_turn()

        return {
            'ok': True,
            'player_username': player.username,
        }

    # -------- Win --------
    def check_win(self):
        alive = [p for p in self.players if p.alive]

        if self.mode == '2v2':
            team0 = [p for p in self.players[0:2] if p.alive]
            team1 = [p for p in self.players[2:4] if p.alive]

            if not team0 and team1:
                self.winner = team1[0].user_id
                self.ended_reason = "الفريق الثاني فاز — الفريق الأول خرج بالكامل"
                self.status = 'ended'
                self.phase = 'ended'
                return {
                    'winner_user_id': self.winner,
                    'winner_username': 'الفريق الثاني',
                    'reason': self.ended_reason,
                }
            elif not team1 and team0:
                self.winner = team0[0].user_id
                self.ended_reason = "الفريق الأول فاز — الفريق الثاني خرج بالكامل"
                self.status = 'ended'
                self.phase = 'ended'
                return {
                    'winner_user_id': self.winner,
                    'winner_username': 'الفريق الأول',
                    'reason': self.ended_reason,
                }
            return None

        if len(alive) <= 1:
            if alive:
                self.winner = alive[0].user_id
                self.ended_reason = "آخر لاعب صامد"
            self.status = "ended"
            self.phase = "ended"
            return {
                "winner_user_id": self.winner,
                "winner_username": alive[0].username if alive else None,
                "reason": self.ended_reason,
            }
        return None

    # -------- Serialize --------
    def to_dict(self):
        base = {
            "room_id": self.room_id,
            "mode": self.mode,
            "status": self.status,
            "phase": self.phase,
            "current_turn_idx": self.current_turn_idx,
            "consecutive_doubles": self.consecutive_doubles,
            "dice": self.dice,
            "dice_rolled": self.dice_rolled,
            "awaiting_roll": self.awaiting_roll,
            "awaiting_move_done": self.awaiting_move_done,
            "awaiting_decision": self.awaiting_decision,
            "players": [
                p.to_dict(
                    team_idx=(i // 2) if self.mode == "2v2" else None
                )
                for i, p in enumerate(self.players)
            ],
            "board": [
                {
                    "index": t["index"],
                    "name": t["name"],
                    "type": t["type"],
                    "owner": t.get("owner"),
                    "level": t.get("level"),
                    "rent": t.get("rent"),
                    "rent_multiplier": t.get("rent_multiplier", 1),
                    "owner_team_idx": (
                        self._owner_team_idx(t.get("owner"))
                        if self.mode == "2v2"
                        else None
                    ),
                }
                for t in self.board
            ],
            "winner": self.winner,
            "ended_reason": self.ended_reason,
        }

        if self.phase == 'rps':
            active_count = len(self.rps_active_ids)
            base['rps'] = {
                'chosen_count': len(self.rps_choices),
                'total': active_count,
                'round': self.rps_round,
                'active_ids': list(self.rps_active_ids),
            }
        return base


# ==========================================
# 🌍 Global
# ==========================================
active_games: Dict[int, GameState] = {}


def create_game(room_id, mode, players):
    gs = GameState(room_id, mode, players)
    active_games[room_id] = gs
    return gs


def get_game(room_id):
    return active_games.get(room_id)


def remove_game(room_id):
    if room_id in active_games:
        del active_games[room_id]