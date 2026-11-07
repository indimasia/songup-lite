import sys, json, re
from urllib.parse import urlparse, parse_qs
from ytmusicapi import YTMusic

def video_id(q):
    # URL -> video id only; &list= is ignored so playlist links add just that one video
    u = urlparse(q.strip())
    if not u.netloc or "youtu" not in u.netloc: return None
    m = re.match(r"^/(?:shorts|embed|live)/([\w-]{11})", u.path)
    return parse_qs(u.query).get("v", [None])[0] or (u.path[1:12] if "youtu.be" in u.netloc else m and m[1])

yt, q = YTMusic(), sys.argv[1]
if vid := video_id(q):
    d = yt.get_song(vid).get("videoDetails", {})
    out = [{"videoId": vid, "title": d.get("title", vid), "artist": d.get("author", "Unknown"),
            "duration": int(d.get("lengthSeconds", 0))}] if d else []
else:
    r = sorted(yt.search(q, filter="videos"), key=lambda x: "UGC" in x.get("videoType", ""))[:6]
    out = [{"videoId": x["videoId"], "title": x["title"],
            "artist": ", ".join(a["name"] for a in x.get("artists", [])) or "Unknown",
            "duration": x.get("duration_seconds", 0)} for x in r if x.get("videoId")]
print(json.dumps(out))
