import sys, json
from ytmusicapi import YTMusic
r = YTMusic().search(sys.argv[1], filter="videos")
r = sorted(r, key=lambda x: "UGC" in x.get("videoType", ""))[:6]
print(json.dumps([{"videoId": x["videoId"], "title": x["title"],
  "artist": ", ".join(a["name"] for a in x.get("artists", [])) or "Unknown",
  "duration": x.get("duration_seconds", 0)} for x in r if x.get("videoId")]))
