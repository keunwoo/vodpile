vodpile
=======

GSL 2014 Starcraft 2 VOD browsing UI -
[keunwoo.github.io/vodpile](http://keunwoo.github.io/vodpile/)


## Introduction

**This project is not affiliated with or endorsed by GOM eXP or Twitch.tv.**

[GOM eXP](http://www.gomexp.com) is currently hosting its 2014 Starcraft 2
on-demand videos (VODs) for the GSL on [Twitch](http://twitch.tv).
Unfortunately, Twitch's current UI for browsing videos is a significant step
backwards from previous years' archives on [GOM TV](http://www.gomtv.net): you
have to click "Load More" repeatedly on the "Past Broadcasts" page and mouse
over the video thumbnails sequentially to find the one you want.

Twitch may fix this eventually by giving channel authors more tools for
organizing past broadcasts.  In the meantime, I hacked up this quick & dirty UI.


## Caveats and questions

GSL-specific video metadata (league, series, match, set) are extracted by
heuristically parsing video titles returned by the [Twitch API][twitch-api].  It
is impossible to predict how GOM will name future videos, or indeed whether they
will maintain a machine-parseable naming scheme.  They've been pretty good about
this so far, but the parser will have to be updated periodically, and we may
eventually even have to resort to hand-cataloguing video URLs.

Since only the GSL Season 1, Code A group stages have been played, only those
videos are currently supported.  I intend to keep the scraper roughly current as
more matches are played, but this is a very minor side project for me, so I make
no guarantees about updating it in a timely manner.  If the wait becomes
intolerable for you, use Twitch's UI, or watch the matches live.

### Q: Why is [video X] missing?

A: See caveats above.  If GOM uploads a video that breaks the title parser's
assumptions, it will be omitted from the VOD list.  This could occur due to a
mistake by GOM, or a change in their titling scheme since the last time I
updated the code.  Feel free to [file an issue on Github][github-issue].

### Q: Can you implement a feature that automatically advances to the next video when the current one finishes playing?

A: Unfortunately, as far as I can tell, Twitch's embeds do not offer a supported
JavaScript API for detecting when a video finishes playing.  Since we cannot
detect this event reliably from the host page, there is no sane way of advancing
automatically.

### Q: I can't view any videos!

A: Currently GSL 2014 VODs are subscriber-only.  Are you sure you have a VOD
subscription?  Alternatively Twitch might be down or slow; try reloading the
page.  If neither of these is the issue for you, feel free to [file an
issue][github-issue]


## Hacking

Local development requires:

* [Jekyll](http://jekyllrb.com) to preview the rendered Github page, and a
version of [Ruby](http://rubylang.org) that can run Jekyll (any recent stable
version should do; see [Jekyll's gem page](http://rubygems.org/gems/jekyll)
for dependency details).
* A Markdown variation sufficiently [GFM](github-markdown)-compatible to preview
this README.

The code is kind of a mess.  Oh well.


## TODO

* Use URL fragments to behave correctly with browser back/forward.
* Better error handling.
* Better mouse-only way to browse the video list (without searching).
* UI to advance to next video.
* Keyboard shortcuts.
* Remember user's position with cookie/local storage. (speculative)


## License

See LICENSE file in this directory.


[appengine]: https://developers.google.com/appengine/
[github-issue]: https://github.com/keunwoo/vodpile/issues
[github-markdown]: https://github.github.com/github-flavored-markdown/
[twitch-api]: https://github.com/justintv/Twitch-API
