Interactive Bible Study Guides

A free platform for personal and group Bible study. No account, no payment, no tracking.
Notes and progress are saved in the reader's own browser on their own device.

Available now

Romans, Galatians, Ephesians, Philippians and Colossians. Open index.html, or the
hosted site, and pick a book. The Fear of the Lord, a topical study across both
testaments, is written and sitting in draft awaiting review.

Planned, in this order: 1 and 2 Thessalonians, 1 and 2 Corinthians, 1 and 2 Timothy,
Titus, Philemon, Hebrews, then the four Gospels, then the Old Testament one book at a time.

How the site is built

The pages at the repository root are generated. The sources are in content/: one JSON
file per study, plus content/site.json for the home page and content/scripture/bsb.json
for the passage text. Nothing is typed into HTML by hand.

    node tools/validate.mjs     check the content
    node tools/build.mjs        rebuild every page

There is no framework and there are no dependencies: the build runs on a bare Node
install and writes plain static HTML. That is a deliberate choice for a site that has to
stay free, load on a weak connection, be readable with JavaScript off, and still be
maintainable in five years. CONTENT.md explains how to write a study.

Adding a book, or a topical study, is now writing one content file. The same schema
covers both, so tracing a theme across Genesis and Hebrews works exactly like walking
through Colossians chapter by chapter.

How each guide works

Every guide is one page with tabbed sections: an overview, historical background, a study
unit for each chapter or chapter block, and a closing summary. Each unit carries key themes,
the passage text, cross references you can click to read in place, reflection questions for
personal and group use, application notes, a notes box and a checklist. The progress bar
reflects the checklist items you have ticked across the whole book.

Scripture text

Quotations are from the Holy Bible, Berean Study Bible (BSB), Copyright 2016, 2020 by
Bible Hub. All rights reserved worldwide. Used under the free licence granted for websites,
apps, software and audio: http://berean.bible/licensing.htm

The passage text in each guide is generated from a licensed dataset rather than typed by
hand, so it can be regenerated or swapped for another translation without editing the pages.

Your notes and your privacy

Notes and ticks are stored with the browser's local storage, under keys prefixed
bsg:<book>:. Nothing leaves the device and nothing is sent to a server. On a shared or
public computer, use the "Clear my saved notes and ticks" button under the progress bar
before you walk away. In a private browsing window the page still works, and it says
plainly that the notes will not be kept.

Look and feel

One stylesheet, assets/css/app.css, styles every page. There is no inline CSS left in the
HTML and no build step. The palette is espresso brown, antique gold and warm cream, set as
custom properties at the top of that file, so a colour change is a one line edit. Headings
and Scripture are set in Fraunces, body text in Instrument Sans, both self-hosted from
assets/fonts so the pages load no third party resources at all.

Card types are colour coded so a reader can tell teaching from warning from question at a
glance: gold for themes and passages, brown for historical background, rust for warnings,
olive for application, and a solid dark brown card for the reflection questions. Dark mode
follows the reader's system setting. There is a print stylesheet that opens every section
at once, so printing a guide gives you the whole book as a workbook rather than only the
tab that happens to be open.

Running it locally

No build step and no dependencies, but serve the folder rather than opening the file
directly, because browsers block font loading over file:// and you will get fallback
fonts:

    python3 -m http.server 8000

then visit http://localhost:8000

Deploying to Firebase Hosting

The site is static, so it runs on the Firebase Spark (free) plan. Once only, install the
CLI and point the folder at your Firebase project:

    npm install -g firebase-tools
    firebase login
    firebase use --add

That writes a .firebaserc naming your project, which is deliberately not committed here so
nobody deploys to the wrong project by accident. Then deploy:

    firebase deploy --only hosting

firebase.json is already configured: the repository root is the web root, clean URLs are on
so /romans works as well as /romans.html, 404.html serves as the not-found page, HTML is
served must-revalidate so updates reach readers immediately, and static assets get long
cache lifetimes.

Contributing a study

Read CONTENT.md. In short: studies are JSON files in content/studies, validated by
tools/validate.mjs and rendered by tools/build.mjs. Never edit the generated HTML at the
repository root, and never change an id that has already been published, because readers'
saved notes and ticks are keyed to those ids.

Licence

The study material in this repository is free to use, copy, print and teach from, for
personal, family and church use. The Scripture text carries the Berean licence noted above.
