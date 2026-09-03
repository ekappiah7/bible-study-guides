"""One-off migration: parse the hand-written HTML guides into content JSON.

Run once, kept for the record. The generated JSON in content/studies is the source
of truth from here on; these HTML files are rebuilt from it by tools/build.mjs.

Every element id (checkboxes, textareas, completion badges, section ids) is carried
across unchanged, because readers' saved notes and ticks are keyed to them.

Requires: pip install beautifulsoup4
"""
import json, re, sys, os
from bs4 import BeautifulSoup, NavigableString, Tag

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BOOKS = {
    "galatians.html": dict(
        id="galatians", title="Galatians", tagline="Freedom in Christ",
        testament="new", group="Pauline epistles", order=9, chapters=6,
        opening="Ready to begin your journey!"),
    "ephesians.html": dict(
        id="ephesians", title="Ephesians", tagline="God's Eternal Plan of Unity",
        testament="new", group="Pauline epistles", order=10, chapters=6,
        opening="Ready to discover God's eternal plan!"),
    "philippians.html": dict(
        id="philippians", title="Philippians", tagline="Joy in Christ",
        testament="new", group="Pauline epistles", order=11, chapters=4,
        opening="Ready to begin your journey!"),
    "colossians.html": dict(
        id="colossians", title="Colossians", tagline="Christ Supreme & Sufficient",
        testament="new", group="Pauline epistles", order=12, chapters=4,
        opening="Ready to begin your journey!"),
    "romans.html": dict(
        id="romans", title="Romans", tagline="The Gospel Revealed",
        testament="new", group="Pauline epistles", order=6, chapters=16,
        opening="Ready to explore Paul's masterpiece!"),
}

CARD_TYPE = {
    "theme-box": "themes",
    "historical-context": "context",
    "warning-box": "warning",
    "application-modern": "application",
    "reflection-box": "reflection",
    "notes-section": "notes",
    "interactive-element": "checklist",
    "verse-highlight": "passage",
    "study-tools": "toolgrid",
}


EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2190-\u21ff\u2300-\u23ff\u2460-\u24ff\u25a0-\u27bf\u2b00-\u2bff\ufe0f\u200d]+")
REF = re.compile(r"^(?:[123]\s+)?[A-Z][a-z]+\.?\s+\d+:[\d,\-\s]+$")


def inner(el):
    """Inner HTML of a tag, with inline markup kept and whitespace tidied."""
    out = "".join(str(c) for c in el.contents)
    out = re.sub(r"\s+", " ", out).strip()
    out = EMOJI.sub("", out).strip()
    out = re.sub(r"\s{2,}", " ", out)
    return out


def body_nodes(el, skip_h3=True):
    """Ordered content nodes inside a card: paragraphs, lists, sub-headings."""
    nodes = []
    for child in el.children:
        if isinstance(child, NavigableString):
            continue
        if not isinstance(child, Tag):
            continue
        name = child.name
        if name == "h3" and skip_h3:
            continue
        if name == "h4":
            nodes.append({"h4": inner(child)})
        elif name == "p":
            nodes.append({"p": inner(child)})
        elif name in ("ul", "ol"):
            items = [inner(li) for li in child.find_all("li", recursive=False)]
            nodes.append({name: items})
        elif name == "div":
            # spacing wrappers in the old markup; flatten them
            nodes.extend(body_nodes(child, skip_h3=False))
    return nodes


def parse_card(card, book_name=""):
    classes = card.get("class", [])
    kind = next((CARD_TYPE[c] for c in classes if c in CARD_TYPE), None)
    if kind is None:
        return None

    h3 = card.find("h3", recursive=False)
    heading = inner(h3) if h3 else None

    if kind == "passage":
        p = card.find("p", recursive=False)
        strong = p.find("strong") if p else None
        refs = [s["data-scripture"] for s in card.find_all("span", class_="cross-reference")]
        label = inner(strong).rstrip(":").strip() if strong else None

        # the closing pull quote carries the quotation inside the strong, no reference prefix
        if label and label[0] in "\u201c\"":
            attrib = card.find_all("p")[-1]
            return {"type": "pullquote",
                    "ref": inner(attrib).lstrip("-\u2013 ").strip(),
                    "text": label.strip("\u201c\u201d\"")}

        if label and REF.match(label):
            block = {"type": "passage", "ref": label}
            if refs:
                block["crossRefs"] = refs
            return block

        # a featured card in passage clothing: a list of references, or a themed list
        items = [inner(li) for li in card.find_all("li")]
        marks = [re.search(r"\((\d+:[\d\-]+)\)\s*$", i) for i in items]
        if items and all(marks):
            return {"type": "passageList", "heading": label,
                    "refs": ["%s %s" % (book_name, m.group(1)) for m in marks]}
        nodes = [n for n in body_nodes(card) if n.get("p") != (inner(p) if p else None)]
        return {"type": "highlight", "heading": label, "body": nodes}

    if kind == "reflection":
        questions = []
        for q in card.find_all("div", class_="discussion-question"):
            strong = q.find("strong")
            audience = inner(strong).rstrip(":").strip() if strong else "Question"
            raw = inner(q)
            text = re.sub(r"^<strong>[^<]*</strong>\s*", "", raw).strip()
            questions.append({"audience": audience, "text": text})
        return {"type": "reflection", "heading": heading, "questions": questions}

    if kind == "notes":
        ta = card.find("textarea")
        return {"type": "notes", "heading": heading, "id": ta.get("id"),
                "placeholder": ta.get("placeholder", "")}

    if kind == "checklist":
        items = []
        for row in card.find_all("div", class_="checkbox-item"):
            box = row.find("input")
            label = row.find("label")
            items.append({"id": box.get("id"), "text": inner(label)})
        badge = card.find("span", class_="completion-badge")
        intro = [n for n in body_nodes(card) if "p" in n]
        block = {"type": "checklist", "heading": heading, "items": items}
        if intro:
            block["intro"] = intro[0]["p"]
        if badge:
            block["badge"] = {"id": badge.get("id"), "text": inner(badge)}
        return block

    if kind == "toolgrid":
        cards = []
        for tc in card.find_all("div", class_="tool-card"):
            h = tc.find("h3")
            cards.append({"heading": inner(h) if h else None, "body": body_nodes(tc)})
        return {"type": "toolgrid", "cards": cards}

    return {"type": kind, "heading": heading, "body": body_nodes(card)}


def convert(fname, meta):
    soup = BeautifulSoup(open(os.path.join(REPO, fname), encoding="utf-8").read(), "html.parser")

    nav_labels = {}
    for b in soup.find_all("button", class_="nav-button"):
        m = re.search(r"showSection\('([a-z0-9]+)'\)", b.get("onclick", ""))
        if m:
            nav_labels[m.group(1)] = b.get_text(strip=True)

    units = []
    for section in soup.find_all("div", class_="content-section"):
        sid = section.get("id")
        h2 = section.find("h2", class_="section-title")
        blocks = []
        for card in section.find_all("div", recursive=False):
            parsed = parse_card(card, meta["title"])
            if parsed:
                blocks.append(parsed)
        # a badge can sit directly in the section rather than inside a checklist card
        loose = section.find("span", class_="completion-badge", recursive=False)
        unit = {
            "id": sid,
            "navLabel": nav_labels.get(sid, inner(h2) if h2 else sid),
            "title": inner(h2) if h2 else None,
            "blocks": blocks,
        }
        if loose is not None:
            unit["badge"] = {"id": loose.get("id"), "text": inner(loose)}
        units.append(unit)

    desc = soup.find("meta", attrs={"name": "description"})
    study = {
        "$schema": "../schema.json",
        "id": meta["id"],
        "kind": "book",
        "status": "published",
        "slug": meta["id"],
        "title": meta["title"],
        "pageTitle": inner(soup.find("h1")),
        "tagline": meta["tagline"],
        "docTitle": soup.find("title").get_text(strip=True),
        "metaDescription": desc["content"] if desc else "",
        "canon": {
            "testament": meta["testament"],
            "group": meta["group"],
            "order": meta["order"],
            "chapters": meta["chapters"],
        },
        "progressOpening": meta["opening"],
        "units": units,
    }
    return study


if __name__ == "__main__":
    os.makedirs(os.path.join(REPO, "content/studies"), exist_ok=True)
    for fname, meta in BOOKS.items():
        study = convert(fname, meta)
        out = os.path.join(REPO, "content/studies", meta["id"] + ".json")
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(study, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        counts = {}
        for u in study["units"]:
            for b in u["blocks"]:
                counts[b["type"]] = counts.get(b["type"], 0) + 1
        print(f"{meta['id']:12} {len(study['units'])} units, blocks: " +
              ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
