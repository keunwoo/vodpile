GO=go
JEKYLL=jekyll
MARKDOWN=markdown

default: run-jekyll

run-jekyll:
	$(JEKYLL) serve --watch

jekyll:
	$(JEKYLL) --destination _site

readme:
	$(MARKDOWN) README.md >README.html || rm -f README.html

titledump: twitch/dump/dump.go data/gsl-pastBroadcasts.json
	$(GO) run $< -input=$(word 2, $^) > $@ || rm -f $@

clean:
	rm -Rf \
	  _site \
	  README.html \
	  titledump \
	  `find . -name '*~'`
