JEKYLL=jekyll
MARKDOWN=markdown

default: run-jekyll

run-jekyll:
	$(JEKYLL) serve --watch

jekyll:
	$(JEKYLL) --destination _site

readme:
	$(MARKDOWN) README.md >README.html || rm -f README.html

clean:
	rm -Rf \
	  _site \
	  README.html \
	  `find . -name '*~'`
