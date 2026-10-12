# Privacy policy: InkDom Timers (unofficial)

Last changed: 11 October 2026.

InkDom Timers is a Chrome extension that adds a timers panel and a people layer to the game at
https://inkdom.io/play. It is not made by, or endorsed by, the game's developer.

## In short

The extension sends nothing anywhere. It has no server, no analytics, no advertising and no account of its own.
What it reads stays in your browser, and part of it is saved on your computer so the panel still knows it after a
reload.

## What it reads

The extension runs on `https://inkdom.io/play` and nowhere else. There it reads:

- Responses the game's own page receives: the map view and who is in it, the world feed, the player and alliance
  directories, land lists and land shapes, your shop data and the season.
- The game's own ink label on the page.
- From the game's requests, one thing: the four map edges in its "who is in view" question. It never reads
  request headers, where your login is, and it never reads cookies or passwords.
- Where your pointer is over the map, while the People layer is switched on, to show the figure for the hexagon
  under it. This is used at once and not kept.

It makes no requests of its own. The people figures ship inside the extension; they are not downloaded.

## What it saves on your computer

Saved with Chrome's extension storage (`chrome.storage.local`), on this computer only. It is not synced to your
Google account.

- About you: your player id, your land area, your ink and when it was read, your lands' country names, shield
  and lock times, your refills and when they reset, your Joker time and the season's end.
- About other players: for those seen on your screen in the last 48 hours, and those you pinned, their player id,
  name, colour, initials, land area, the times of their first and latest loop, when they were last on your screen,
  and for each of their lands the country name and when its shield ends. Other players drop out of the saved
  record once they have been off your screen for 48 hours, unless pinned.
- About the panel: where you put it, whether it is folded, whether the People layer is on, which players you
  pinned, and the difference between your computer's clock and the game's.

Land shapes, the full player directory, the alliance list and the current map view are held in memory only and
are gone when the tab closes.

## What it does not do

- It does not send, sell or share any of this with anyone, the author included.
- It does not load or run code from the network.
- It does not click, draw, buy or send anything in the game.
- It does not read anything on any other site.

Its use of data follows the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Removing what is saved

Removing the extension at `chrome://extensions` deletes everything it saved.

## Questions and changes

Questions go to the support contact shown on the extension's Chrome Web Store page. If this policy changes, the
new text and its date appear in this file.
