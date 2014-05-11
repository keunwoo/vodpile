vodpile.test = {};

module("Title Parsing");

asyncTest("parseVideoTitles", function() {
    expect(3);

    $.getJSON(vodpile.CACHED_DATA_PATH, function(data) {
        var rawVids = vodpile.videoListToDict(data);
        var parseResult = vodpile.parseVideos(rawVids);
        var vids = parseResult.parsed;
        var unparsed = parseResult.unparsed;

        ok(vids.size() > 0, "Nonempty set of parsed videos");

        strictEqual(
            (vids.size() + unparsed.length + parseResult.blacklisted.length),
            rawVids.size(),
            "All videos are either parsed, unparsed, or blacklisted.");

        var unparsedTitles = [];
        vodpile.each(unparsed, function(v) {
            console.log("Unparsed: " + v.title);
        });
        strictEqual(unparsed.length, 0,
                    "Should have zero unparsed video titles.");

        start();
    });
});

asyncTest("allTitleFormatsUsedAtLeastOnce", function() {
    expect(1);

    $.getJSON(vodpile.CACHED_DATA_PATH, function(data) {
        var rawVids = vodpile.videoListToDict(data);
        var unusedFormats = [];
        vodpile.parseVideos(rawVids, unusedFormats);
        vodpile.each(unusedFormats, function(fmt) {
            console.log('unused: ' + fmt.name);
        });
        strictEqual(unusedFormats.length, 0,
                    "There are zero unused title formats.");

        start();
    });
});

test("unparsed title formats are correctly reported", function() {
    expect(3);

    var fakeVids = new vodpile.Dict();
    fakeVids.put('dummyid', { 'title': 'BOGUS_TITLE' });
    var parseResult = vodpile.parseVideos(fakeVids);

    strictEqual(parseResult.parsed.size(), 0,
                "No valid videos should have been parsed.");
    strictEqual(parseResult.unparsed.length, 1,
                "1 unparsed video should have been reported.");
    strictEqual(parseResult.blacklisted.length, 0,
                "No blacklisted videos should have been parsed.");
});


/* global $, asyncTest, expect, module, ok, strictEqual, start, test,
   vodpile */
