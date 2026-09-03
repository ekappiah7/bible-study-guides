"""Resolve every passage reference used by the studies into a committed text cache.

Reads the references out of content/studies/*.json and writes content/scripture/bsb.json,
so tools/build.mjs needs no Bible source of its own and anyone can build the site.

Re-run this (with a full Berean text source available) after adding studies, or to swap
the translation. Passage text is never typed by hand.
"""
import json, glob, os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE = os.environ.get("BSB_SOURCE", "")

NAME2OSIS = {
 "genesis":"Gen","exodus":"Exod","leviticus":"Lev","numbers":"Num","deuteronomy":"Deut",
 "joshua":"Josh","judges":"Judg","ruth":"Ruth","1 samuel":"1Sam","2 samuel":"2Sam",
 "1 kings":"1Kgs","2 kings":"2Kgs","1 chronicles":"1Chr","2 chronicles":"2Chr","ezra":"Ezra",
 "nehemiah":"Neh","esther":"Esth","job":"Job","psalm":"Ps","psalms":"Ps","proverbs":"Prov",
 "ecclesiastes":"Eccl","song of solomon":"Song","isaiah":"Isa","jeremiah":"Jer",
 "lamentations":"Lam","ezekiel":"Ezek","daniel":"Dan","hosea":"Hos","joel":"Joel","amos":"Amos",
 "obadiah":"Obad","jonah":"Jonah","micah":"Mic","nahum":"Nah","habakkuk":"Hab","zephaniah":"Zeph",
 "haggai":"Hag","zechariah":"Zech","malachi":"Mal","matthew":"Matt","mark":"Mark","luke":"Luke",
 "john":"John","acts":"Acts","romans":"Rom","1 corinthians":"1Cor","2 corinthians":"2Cor",
 "galatians":"Gal","ephesians":"Eph","philippians":"Phil","colossians":"Col",
 "1 thessalonians":"1Thess","2 thessalonians":"2Thess","1 timothy":"1Tim","2 timothy":"2Tim",
 "titus":"Titus","philemon":"Phlm","hebrews":"Heb","james":"Jas","1 peter":"1Pet","2 peter":"2Pet",
 "1 john":"1John","2 john":"2John","3 john":"3John","jude":"Jude","revelation":"Rev",
}


def load_source():
    """The Berean text plus its canonical verse index, from a local dataset."""
    if not SOURCE:
        sys.exit("Set BSB_SOURCE to the folder holding berean_verses.json and "
                 "index_conversions.json")
    verses = json.load(open(os.path.join(SOURCE, "berean_verses.json")))["verses"]
    index = json.load(open(os.path.join(SOURCE, "index_conversions.json")))["osisRef"]
    return verses, index


def resolve(ref, verses, index):
    m = re.match(r"^\s*((?:[123]\s+)?[A-Za-z][A-Za-z ]*?)\.?\s+(\d+):([\d,\-\s]+)\s*$", ref)
    if not m:
        return None
    book = NAME2OSIS.get(m.group(1).strip().lower())
    if not book:
        return None
    chapter, spec = int(m.group(2)), m.group(3)
    parts = []
    for piece in [p.strip() for p in spec.split(",") if p.strip()]:
        a, b = (piece.split("-") + [piece])[:2] if "-" in piece else (piece, piece)
        for v in range(int(a), int(b) + 1):
            i = index.get(f"{book}.{chapter}.{v}")
            if i is None:
                return None
            parts.append(verses[i].strip())
    return " ".join(parts)


def refs_in_studies():
    found = set()
    for f in glob.glob(os.path.join(REPO, "content/studies/*.json")):
        study = json.load(open(f, encoding="utf-8"))
        for unit in study.get("units", []):
            for block in unit.get("blocks", []):
                if block.get("ref"):
                    found.add(block["ref"])
                for key in ("crossRefs", "refs", "passages"):
                    for r in block.get(key, []) or []:
                        found.add(r)
    return found


if __name__ == "__main__":
    verses, index = load_source()
    out_path = os.path.join(REPO, "content/scripture/bsb.json")
    existing = {}
    if os.path.exists(out_path):
        existing = json.load(open(out_path, encoding="utf-8")).get("passages", {})

    passages, failed = {}, []
    for ref in sorted(refs_in_studies()):
        text = resolve(ref, verses, index)
        if text:
            passages[ref] = text
        elif ref in existing:
            passages[ref] = existing[ref]
        else:
            failed.append(ref)

    payload = {
        "translation": {
            "id": "BSB",
            "name": "Berean Study Bible",
            "notice": ("The Holy Bible, Berean Study Bible, BSB. Copyright © 2016, 2020 "
                       "by Bible Hub. All rights reserved worldwide. Used under the free "
                       "licence granted for websites, apps, software and audio."),
            "licenceUrl": "http://berean.bible/licensing.htm",
        },
        "passages": passages,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {len(passages)} passages to content/scripture/bsb.json")
    if failed:
        print("UNRESOLVED (fix the reference or the source):")
        for r in failed:
            print("  ", r)
        sys.exit(1)
