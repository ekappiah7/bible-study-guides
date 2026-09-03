Writing a study

Every page on this site is generated from the files in content/. You do not edit HTML.
You write a study as one JSON file, run the build, and the site rebuilds itself.

    node tools/validate.mjs     check your content, with plain error messages
    node tools/build.mjs        write the HTML pages
    node tools/build.mjs --drafts   include studies still marked draft

Validate before you build. The validator catches the mistakes that matter, especially
duplicated or renamed ids, which silently destroy a reader's saved notes.

The two kinds of study

A study is either a book or a topic, set by the kind field.

A book study walks one book of the Bible in order. Its units are chapters, or blocks of
chapters where that serves the argument better; Romans is grouped 1-3, 4-5, 6-8, 9-11,
12-14, 15-16 because that is how the letter actually moves. Give it a canon block so the
home page can order it correctly.

A topic study traces one theme across many passages and many books. Its units are
movements in the argument rather than chapters, and each unit lists the passages it
works through. Give it a topic block with a category. content/studies/fear-of-the-lord.json
is a worked example covering both testaments.

Everything else is identical between them, which is the point: one schema, one renderer,
one design.

The shape of a study file

    id            never changes once published. Readers' notes are saved under
                  bsg:<id>: in their own browser, so changing it loses their work.
    kind          book or topic
    status        published, or draft while you are still writing
    slug          the URL and filename, so romans gives /romans
    title         short name
    tagline       one line under the title
    metaDescription   one or two sentences for search results
    canon         for books: testament, group, order (1 to 66), chapters
    topic         for topics: category, anchorBooks
    sources       where your historical claims come from. Not optional in spirit:
                  a study guide that asserts history should say who says so.
    units         the tabs, in order

Units are conventionally overview, background, study1 to studyN, summary. Unit ids must
be lowercase letters and digits, and they become the URL hash, so /romans#study4 links
straight to that unit. Like study ids, never change them once published.

The blocks you can use

Each unit is a list of blocks. The type decides both how it looks and what it means to
the reader, so pick the one that matches the content rather than the one that looks nice.

    themes        key themes, usually a list
    prose         plain teaching
    context       historical background
    warning       a caution, or a false teaching being answered
    application   living it out
    highlight     a featured callout
    observe       observation prompts, to be done before the reader is told what it
                  means. This is the block that makes a guide a study rather than a
                  summary. Use it early in every unit.
    wordstudy     a Greek or Hebrew term, transliterated and explained
    hardquestion  an honest difficulty in the text, named rather than avoided
    passage       one passage, rendered in full with optional cross references
    passageList   several references as clickable chips
    pullquote     a closing quotation
    reflection    questions, each with an audience such as Personal or Group Discussion
    notes         a box the reader writes in
    checklist     ticked items, which is what drives the progress bar
    toolgrid      a row of small cards, used on overview pages

The card types themes, prose, context, warning, application, highlight, observe,
wordstudy and hardquestion all take a body: an ordered list of nodes, where each node is
exactly one of p, h4, ul or ol. Inline strong, em and a are allowed inside the text.

Passage text is never typed by hand

A passage block carries only a reference. The text is filled in at build time from
content/scripture/bsb.json. This is deliberate: it keeps one translation across the whole
site, keeps the licensing correct, and means the whole site can be moved to another
translation by regenerating one file rather than editing every page.

After adding references, refresh the cache:

    BSB_SOURCE=/path/to/berean python3 tools/one-off/build-scripture-cache.py

The validator fails the build if a reference has no cached text, so a broken reference
cannot reach a reader.

Ids, and why they matter more than they look

Checklist items, notes boxes, completion badges and units all carry ids. A reader's ticks
and notes live in their own browser keyed to those ids. Renaming an id does not move
their work, it orphans it. Deleting a block deletes what they wrote in it.

So: add new ids freely, never recycle an old one for different content, and treat a
published id as permanent. The validator enforces uniqueness within a study; permanence
is on you.

Naming that keeps this sane: notes boxes are notes-<unit>-<n>. Checklist ids are short
and unit-scoped, like ch3Goal1 or folS2a.

Adding a study, start to finish

Copy the closest existing file in content/studies, then work through it:

    1. set id, slug, title, kind and status draft
    2. write the units, ids first, content after
    3. run node tools/validate.mjs and fix what it reports
    4. add any new references to the scripture cache
    5. build with --drafts and read the page as a reader would
    6. when it is genuinely finished, set status to published and rebuild

A study is finished when a reader could work through it with a Bible and nothing else,
and when its questions could carry the discussion time the overview claims.

What not to do

Do not edit the generated HTML at the repository root. It is overwritten on every build,
and the banner at the top of each file says so.

Do not put styles in content. The design lives in assets/css/app.css, and every block
type is already styled. If a block needs a look that does not exist, add the type to the
schema, the renderer and the stylesheet, rather than working around it inline.

Do not paste passage text from a copyrighted translation.
