# Skida cele Telegram sticker pakete u assets/telegram/<ImePaketa>/.
# Treba bot token (napravi bota kod @BotFather) u env promenljivoj TELEGRAM_BOT_TOKEN.
import json, os, sys, urllib.parse, urllib.request

T = os.environ["TELEGRAM_BOT_TOKEN"]
HERE = os.path.dirname(os.path.abspath(__file__))

def api(method, **params):
    url = f"https://api.telegram.org/bot{T}/{method}?{urllib.parse.urlencode(params)}"
    r = json.load(urllib.request.urlopen(url))
    if not r["ok"]:
        sys.exit(f"{method}: {r}")
    return r["result"]

for name in sys.argv[1:] or ["UtyaDuck", "BlackUtyaDuck", "UtyaDuckFull"]:
    stickers = api("getStickerSet", name=name)["stickers"]
    folder = os.path.join(HERE, name)
    os.makedirs(folder, exist_ok=True)
    emoji = {}
    for i, st in enumerate(stickers):
        path = api("getFile", file_id=st["file_id"])["file_path"]
        out = f"{i:03d}{os.path.splitext(path)[1]}"  # .webp / .tgs / .webm
        emoji[out] = st.get("emoji", "")
        if not os.path.exists(os.path.join(folder, out)):
            urllib.request.urlretrieve(f"https://api.telegram.org/file/bot{T}/{path}", os.path.join(folder, out))
    with open(os.path.join(folder, "emoji.json"), "w", encoding="utf-8") as f:
        json.dump(emoji, f, ensure_ascii=False, indent=1)
    print(f"{name}: {len(stickers)} stikera")
