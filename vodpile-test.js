vodpile.test = {};

module("Title Parsing");

asyncTest("parseVideoTitles", function() {
    expect(3);

    $.getJSON("data/gsl-pastBroadcasts-2014-05-10.json", function(data) {
        var rawVids = vodpile.videoListToDict(data);
        var unparsed = [];
        var vids = vodpile.parseVideos(rawVids, unparsed);

        ok(vids.size() > 0, "Nonempty set of parsed videos");

        ok((vids.size() + unparsed.length) === rawVids.size(),
           "All videos are either parsed or unparsed.");

        var unparsedTitles = [];
        vodpile.each(unparsed, function(v) {
            console.log("Unparsed: " + v.title);
        });
        ok(unparsed.length == 0, "Should have no unparsed video titles.");

        start();
    });
});

/* global $, asyncTest, expect, module, ok, start, test, vodpile */
