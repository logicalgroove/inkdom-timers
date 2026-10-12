# Store listings

What goes into the Chrome Web Store developer dashboard for InkDom Timers, field by field, and at the end what
differs on addons.mozilla.org. The pictures are in this folder; `node tools/store-shots.js` takes them again.

The Chrome listing is live at
https://chromewebstore.google.com/detail/inkdom-timers-unofficial/iacgoflofeajgjjoimckhggdjjkniamm.

## Package

`npm run package` writes `dist/inkdom-timers-<version>.zip`. That file is the upload, to both stores.
`npm run lint` runs Mozilla's `web-ext lint` over the extension files; it must report no errors before an upload
to addons.mozilla.org, which runs the same checks.

## Store listing tab

- Name and summary come from `manifest.json`. The summary is its `description`, 131 of the 132 characters allowed.
- Category: Games (under Lifestyle).
- Language: English.
- Store icon: `icons/icon-128.png`.
- Screenshots, 1280x800, in this order: `screenshot-1-overview.png`, `screenshot-2-you.png`,
  `screenshot-3-neighbours.png`, `screenshot-4-people.png`. They show invented players on a stand-in map, and say
  so; the panel and the people layer in them are the real ones.
- Small promo tile, 440x280: `promo-440x280.png`.
- Marquee promo tile, 1400x560: none. It is optional.

Description:

```
InkDom Timers is an unofficial helper for people who play InkDom (https://inkdom.io/play). It is not made by, or endorsed by, the game's developer.

It adds one panel to the game:

• You: when your ink is full, each land's shield and when you can shield it again, refills, Joker, season end.
• On screen: for every player in your current map view, their shield countdown, the window in which they cannot shield again, and an estimate of their ink. Pan or zoom and the list follows. Pin a player to keep the row.
• Hover a row and that player's land outline lights up on the map, with their name on it.
• People: switch on "People" and the map is shaded by people per km², in the hexagons the game counts people in. The panel shows the scale, the hexagon size, and the figure for the hexagon under your pointer.

What it does and does not do:

• It is read-only. It never clicks, draws, buys or sends anything in the game.
• It reads responses the game's page already receives, and the game's own ink label. It makes no requests of its own and never looks at request headers, where your login is.
• Nothing leaves your browser. There is no server and no analytics.
• Other players' ink is an estimate from their last loop and their rank. The extension does not copy the exact figure the game sends.
• The people figures ship inside the extension: Kontur's public population data (release 2023-11-01, CC BY), which the game's own guide names as its source. The game may use another release, so what a loop pays can differ.
• Nothing is hidden from the game's developer: the game's page can tell the extension is installed.

Good to know:

• The game only refreshes its map data while its tab is in front, so the panel is live only then. Countdowns keep running from the last known times.
• If the game changes its data format the panel says so until the extension is updated.
• Needs Chrome 111 or later.

Credits: Kontur Population (CC BY); H3 hexagon grid, h3-js 4.5.0 (Apache-2.0).
```

## Privacy practices tab

Single purpose:

```
Shows timers for the game InkDom on the game's own page: one panel with the player's ink, shields and refills and the shield times of the players in the current map view, with an optional layer that shades the map by population.
```

Justification for `storage`:

```
Saves, on the user's computer only, what the panel has learned from the game (the user's own timers, and the shield times of players seen on screen in the last 48 hours or pinned) and the panel's position and settings, so they survive a reload of the game's tab.
```

Justification for host access, if the dashboard asks (the content scripts match `https://inkdom.io/play*`):

```
The extension works only on the game's page, https://inkdom.io/play. There it reads the responses the game's own page receives, to show the timers, and adds its panel and its map layer to the page. One of its two scripts runs in the page's own world and wraps fetch to read those responses; it passes the original response on untouched, makes no requests and does not read request headers. The extension has no access to any other site.
```

Remote code: "No, I am not using remote code". All scripts and the people data are inside the package.

Data usage. The store counts data that only stays on the user's computer, so "nothing leaves the browser" is not
"nothing collected". Suggested, and yours to certify:

- Website content: yes. The extension reads the game's responses and saves part of them locally.
- User activity: yes. The form's examples include network monitoring and mouse position; the extension reads the
  game's responses as they arrive, and the pointer's place over the map while the People layer is on.
- Personally identifiable information: your call. The only identifiers are the game's player ids and display
  names, your own and other players'. Left unticked here because they are game handles, not names or addresses.
- Everything else (health, financial, authentication, personal communications, location, web history): no.

The three certifications (no sale or transfer to third parties, no use unrelated to the single purpose, no use for
creditworthiness) are all true: nothing is transferred at all.

Privacy policy URL: the public address of `PRIVACY.md`. The store requires one because the extension saves game
data locally.

## Test instructions tab

```
The extension only acts on https://inkdom.io/play. Sign in to the game there. A dark "Timers" panel appears at the top right of the map within a few seconds: the "You" section shows the signed-in player's ink and shields, and "On screen" lists the players in the current map view. Hover a row to outline that player's land. Switch on "People" in the panel to shade the map by population. The extension has no popup, no options page and no toolbar action.
```

If the reviewer needs an account to get past the game's sign-in, give a test account's details in this tab.

## addons.mozilla.org

The same zip is the upload. The add-on id, `inkdom-timers@logicalgroove.github.io`, is in the manifest and is
fixed for good once the first upload is signed. One listing covers desktop Firefox and Firefox for Android; the
manifest asks for Firefox 140 on desktop and 142 on Android.

- Name, summary and the data collection declaration (none) come from the manifest.
- Category: Games & Entertainment. Also tick Android, so the listing shows up in the phone browser.
- Description, screenshots and icon: the same as above. Mozilla takes screenshots of any size.
- Privacy policy: the same text, pasted into the listing. Mozilla keeps the text rather than a link.
- Notes to reviewer: the test instructions above, plus the licence of the H3 library in `vendor/`, and that the
  people data file is a binary built from Kontur's public population data by `tools/build-people.js`.
- Source code: not needed. Nothing is minified or built by a bundler; the H3 file in `vendor/` is the library's
  own unmodified release.
