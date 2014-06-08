var vodpile = vodpile || {};

/**
 * When true, load data directly from Twitch instead of using the cached
 * data checked into our repository.
 */
vodpile.SKIP_CACHED_DATA = false;

vodpile.CACHED_DATA_PATH = "data/gsl-pastBroadcasts.json";


/**
 * Thrown on assertion failures.
 * @constructor
 */
vodpile.WTF = function(message) {
    this.message = message;
};

/**
 * @param {boolean} cond when true, throws vodpile.WTF.
 */
vodpile.WTF.when = function(cond, message) {
    if (cond) {
        throw new vodpile.WTF(message);
    }
};


/**
 * Utility string-to-value dictionary class.
 * @constructor
 * @template T
 */
vodpile.Dict = function() {
    this.map_ = {};
    this.keys_ = [];
};

/** @private */
vodpile.Dict.prototype.lookup_ = function(k) {
    if (Object.prototype.hasOwnProperty.call(this.map_, k)) {
        return this.map_[k];
    }
    return undefined;
};

/**
 * @param {string} k
 * @param {T} v
 */
vodpile.Dict.prototype.put = function(k, v) {
    vodpile.WTF.when(typeof k !== 'string');
    vodpile.WTF.when(v === undefined);
    var lookup = this.lookup_(k);
    if (lookup === undefined) {
        this.keys_.push(k);
    }
    this.map_[k] = {
        keyIndex: this.keys_.length - 1,
        value: v
    };
};

/**
 * @param {string} k
 * @param {?T=} ifAbsent
 * @return {T}
 */
vodpile.Dict.prototype.get = function(k, ifAbsent) {
    var lookup = this.lookup_(k);
    if (lookup === undefined) {
        this.put(k, ifAbsent);
        lookup = ifAbsent;
    }
    return lookup.value;
};

/**
 * @param {string} k
 */
vodpile.Dict.prototype.remove = function(k) {
    var lookup = this.lookup_(k);
    if (lookup === undefined) {
        return;
    }

    // If k isn't the last item in this.keys_, move the current last key into
    // the position currently occupied by k.
    if (lookup.keyIndex !== this.keys_.length - 1) {
        var swapKey = this.keys_[this.keys_.length - 1];
        this.map_[swapKey].keyIndex = lookup.keyIndex;
        this.keys_[lookup.keyIndex] = swapKey;
    }

    // Remove key and entry.
    this.keys_.pop();
    delete this.map_[k];
};

/**
 * @return {number} 
 */
vodpile.Dict.prototype.size = function() {
    return this.keys_.length;
};

/**
 * @param {function(T)} f
 */
vodpile.Dict.prototype.each = function(f) {
    var i, k;
    for (i = 0; i < this.keys_.length; ++i) {
        k = this.keys_[i];
        f(k, this.lookup_(k).value);
    }
};

vodpile.Dict.prototype.partition = function(f) {
    var result = new vodpile.Dict();
    this.each(function(k, v) {
        var rep = f(k, v);
        var list = result.get(rep, []);
        list.append({key: k, value: v});
    });
    return result;
};


/**
 * @param {Object} obj
 * @return {string}
 */
vodpile.toDebugString = function(v) {
    var i, prop, hasOwnProp, hasParentProp, result;
    if (typeof v === 'string') {
        return '"' + v + '"';
    } else if (typeof v === 'object') {
        if (Object.prototype.toString.call(v) === '[object Array]') {
            result = ['['];
            for (i = 0; i < v.length; ++i) {
                if (i > 0) {
                    result.push(', ');
                }
                result.push(vodpile.toDebugString(v[i]));
            }
            result.push(']');
            return result.join('');
        } else {
            result = ['{'];
            hasOwnProp = false;
            hasParentProp = false;
            for (prop in v) {
                if (!v.hasOwnProperty(prop)) {
                    hasParentProp = true;
                    continue;
                }
                hasOwnProp = true;
                if (result.length > 1) {
                    result.push(', ');
                }
                result.push(prop);
                result.push(': ');
                result.push(vodpile.toDebugString(v[prop]));
            }
            if (hasParentProp) {
                if (hasOwnProp) {
                    result.push(', ');
                }
                result.push('...(inherited properties)');
            }
            result.push('}');
            return result.join('');
        }
    } else {
        return v.toString();
    }
};

vodpile.each = function(array, f) {
    var i;
    for (i = 0; i < array.length; ++i) {
        f(array[i]);
    }
};

vodpile.enumerate = function(array, f) {
    var i;
    for (i = 0; i < array.length; ++i) {
        f(i, array[i]);
    }
};

vodpile.eachOwnProperty = function(obj, f) {
    var prop;
    for (prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            if (f(prop, obj[prop])) {
                break;
            }
        }
    }
};

vodpile.eachChildElement = function(node, f) {
    var i, child;
    for (i = 0; i < node.childNodes.length; ++i) {
        child = node.childNodes.item(i);
        if (child.nodeType === Node.ELEMENT_NODE) {
            f(child);
        }
    }
};


/**
 * Recursive helper function that implements fetchVideos.
 *
 * @param {string} channel Name of channel whose video list should be fetched.
 * @param {number} limit Size of chunks to fetch.
 * @param {number} offset Start for chunk fetching.
 * @param {boolean} fetchOnlyOneChunk If true, fetches only the first chunk.
 *     Useful for debugging.
 * @param {vodpile.Dict} dest Dict mapping from video IDs to (raw) videos.
 * @param {function(?string)} callback Invoked when all fetches complete.
 *     On error, will receive the error message from the Twitch API; on
 *     success, receives null.
 */
vodpile.fetchVideosHelper = function(channel, limit, offset, fetchOnlyOneChunk,
                                     dest, callback, delayOpt) {
    Twitch.api({
        method: 'channels/gsl/videos',
        params: {
            limit: limit,
            offset: offset,
            // TODO(keunwoo): get both broadcasts and highlights
            broadcasts: true
        }
    }, function(error, result) {
        var delay = (delayOpt || 2000) * 2;
        if (error) {
            console.log('Error fetching videos: ' + error);
            window.setTimeout(function() {
                vodpile.fetchVideosHelper(channel, limit, offset,
                                          fetchOnlyOneChunk, dest, callback,
                                          delay);
            }, delay);
            return;
        }

        var i, v;
        for (i = 0; i < result.videos.length; ++i) {
            v = result.videos[i];
            dest.put(v._id, v);
        }

	// Stop fetching if we appear to have processed all the videos.  There's
	// an inherent race condition with fetching paginated data while the
	// source may be changing, so we stop in any of the following cases:
	// 1. Twitch didn't give us any videos on this fetch.
	// 2. We have fetched at least as many videos as Twitch reports for the
        //    channel total.
	// 3. Twitch didn't give us a next-chunk URL.
        // 4. Caller asked us to stop after first chunk.
        if ((result.videos.length === 0) ||
            (dest.size() >= result._total) ||
            (result._links.next === "") ||
            fetchOnlyOneChunk) {
            callback(null);
            return;
        }

        // Not done yet; recursively fetch next iteration.
        vodpile.fetchVideosHelper(channel, limit, offset + limit,
                                  fetchOnlyOneChunk, dest, callback);
    });
};


/**
 * @param {Array} vidList array of raw video objects returned from Twitch API
 * @return {vodpile.Dict} dict whose values are elements of vidList,
 *     and whose keys are the respective _id values.
 */
vodpile.videoListToDict = function(vidList) {
    var i;
    var vidsDict = new vodpile.Dict();
    for (i = 0; i < vidList.length; ++i) {
        vidsDict.put(vidList[i]['_id'], vidList[i]); 
    }
    return vidsDict;
};


/**
 * Fetches metadata for all videos for the named channel.
 *
 * @param {string} channel
 * @param {function(vodpile.Dict)} callback receives dict mapping from video
 *     IDs to raw video objects.
 */
vodpile.fetchVideos = function(channel, callback) {
    var videos = new vodpile.Dict();
    vodpile.fetchVideosHelper(
        channel, 100, 0, false, videos,
        function(error) {
            if (error) {
                // TODO(keunwoo): display useful error to user.
                console.log(error);  
                return;
            }
            callback(videos);
        });
};


/**
 * Title formats that we intentionally drop on the floor.
 */
vodpile.BLACKLISTED_FORMATS = [
    new RegExp('^xxx$')
];

/**
 * @param {string} title
 * @return {boolean}
 */
vodpile.isBlacklistedTitle = function(title) {
    var i;
    for (i = 0; i < vodpile.BLACKLISTED_FORMATS.length; ++i) {
        if (title.match(vodpile.BLACKLISTED_FORMATS[i])) {
            return true;
        }
    }
    return false;
};

/**
 * @enum
 */
vodpile.TITLE_FORMATS = {

    //////////////////////////////////////////////////////////////////////
    // Season-agnostic formats

    'GSL_2014_LEAGUE_ROUND_MATCH_SET_SEASON': {
        hierarchy: ['League', 'Round of', 'Match', 'Set', 'Season'],
        regex: new RegExp([
            '^(Code [AS]) Ro(\\d+) Match (\\d+) Set (\\d+)',
            ', 2014 GSL Season (\\d+).mp4'
        ].join(''))
    },

    'GSL_2014_SEASON_LEAGUE_GROUP': {
        hierarchy: ['Season', 'League', 'Group'],
        regex: new RegExp(
            '^2014 GSL Season (\\d+) (Code [AS]) Group (\\w+)$')
    },

    'GSL_2014_SEASON_LEAGUE_GROUP_MATCH_SET': {
        hierarchy: ['Season', 'League', 'Group', 'Match', 'Set'],
        regex: new RegExp([
            '^2014 GSL Season (\\d+) ',
            '(Code [AS]) Group (\\w+) [Mm]atch(\\d+) [Ss]et(\\d+)(?:.mp4)?$'
        ].join(''))
    },

    'GSL_2014_LEAGUE_GROUP_MATCH_SET_SEASON': {
        hierarchy: ['League', 'Group', 'Match', 'Set', 'Season'],
        regex: new RegExp([
            '^(Code [AS]) Group (\\w+) [Mm]atch ?(\\d+) [Ss]et ?(\\d+), ',
            '2014 GSL Season (\\d+)(?:.mp4)*$'
        ].join(''))
    },


    'GSL_2014_ROUND_GROUP_MATCHSET': {
        hierarchy: ['League', 'Round of', 'Group', 'Match', 'Set', 'Season'],
        regex: new RegExp([
            '^(Code [AS]) Ro(\\d+) Group (\\w+) Match (\\d+) Set (\\d+),',
            ' 2014 GSL Season (\\d+)(?:.mp4)?$'
        ].join(''))
    },

    'GSL_2014_FINALS_SET': {
        hierarchy: ['League', 'Set', 'Season'],
        regex: new RegExp(
            '^(Code [AS]) Final Set (\\d+), 2014 GSL Season (\\d+).mp4')
    },

    'GSL_2014_FINALS': {
        hierarchy: ['Season', 'League'],
        regex: new RegExp('^2014 GSL Season (\\d+) (Code [AS]) Grand Finals$')
    },

    //////////////////////////////////////////////////////////////////////
    // Season 1 formats

    'GSL_2014_S1_GROUP_MATCHSET_ALT': {
        constants: {
            'season': 1
        },
        hierarchy: ['League', 'Group', 'Match', 'Set'],
        regex: new RegExp([
            '^(Code S) 32[^ ]+ Group (\\w+) Match (\\d+) Set (\\d+)',
            ', 2014 GSL Season 1\\..*$'
        ].join(''))
    },
    
    'GSL_2014_S1_ROUND_GROUP': {
        constants: {
            'season': 1
        },
        hierarchy: ['Season', 'League', 'Round of', 'Group'],
        regex: new RegExp(
            '^(?:2014 GSL Season (\\d+) )?(Code [AS]) Ro(\\d+) Group (\\w+)$')
    },

    'GSL_2014_S1_GROUP_PART': {
        constants: {
            'season': 1
        },
        hierarchy: ['League', 'Group', 'Part'],
        regex: /^2014 GSL Season 1 (Code [AS]) Group (\w+) Part (\d+)$/
    },

    'GSL_2014_S1_ROUND_MATCH': {
        constants: {
            'season': 1
        },
        hierarchy: ['League', 'Round of', 'Match'],
        regex: new RegExp(
            '^(?:2014 GSL Season 1 )?(Code [AS]) Ro(\\d+) [Mm]atch(\\d+)$')
    },

    'GSL_2014_SEASON_LEAGUE_ROUND_DAY': {
        hierarchy: ['Season', 'League', 'Round of', 'Day'],
        regex: new RegExp(
            '^2014 GSL Season (\\d+) (Code [AS]) Ro(\\d+) Day(\\d+)$')
    }
};


/**
 * @param {string} title
 * @return null, or an object
 *       {format: fmt, formatName: string, desc: string}
 *     where fmt is a value in the vodpile.TITLE_FORMATS enum, formatName is the
 *     key in vodpile.TITLE_FORMATS corresponding to fmt, and desc is the
 *     descriptor assembled from the hierarchy.
 */
vodpile.parseVideoTitle = function(title) {
    var result = null;
    vodpile.eachOwnProperty(vodpile.TITLE_FORMATS, function(name, format) {
        var m = title.match(format.regex);
        if (!m) {
            return false;  // continue
        }
        var desc = {};
        var i;
        for (i = 0; i < format.hierarchy.length; ++i) {
            desc[format.hierarchy[i]] = m[i + 1];
        }
        result = {format: format, formatName: name, desc: desc};
        return true;
    });
    return result;
};


/**
 * Heuristically parse raw videos' titles and process into video objects.
 * @param {vodpile.Dict} dict mapping from video IDs to raw video metadata
 *     objects as returned by the Twitch API.
 * @param {Array=} unusedFormatsOpt If this parameter is present, any
 *     title formats that were never used will be pushed onto this array.
 * @return {{parsed: vodpile.Dict, unparsed: Array, blacklisted: Array}
 *     parsed maps from video IDs to our internal video objects, which wrap the
 *     raw video metadata with some fields describing the result of parsing.
 *     unparsed is a list of videos that were not successfully parsed.
 *     blacklisted is a list of videos whose titles were blacklisted.
 */
vodpile.parseVideos = function(rawVideos, unusedFormatsOpt) {
    var unusedFormatsSoFar = null;
    if (unusedFormatsOpt !== undefined) {
        unusedFormatsSoFar = new vodpile.Dict();
        vodpile.eachOwnProperty(vodpile.TITLE_FORMATS, function(name, fmt) {
            unusedFormatsSoFar.put(name, fmt);
        });
    }

    var videos = new vodpile.Dict();
    var unparsed = [];
    var blacklisted = [];
    rawVideos.each(function(id, v) {
        var parsed;

        if (!v.title) {
            unparsed.push(v);
            return;
        }

        if (vodpile.isBlacklistedTitle(v.title)) {
            blacklisted.push(v);
            return;
        }

        parsed = vodpile.parseVideoTitle(v.title);
        if (parsed === null) {
            unparsed.push(v);
            return;
        }

        videos.put(id, {
            rawVideo: v,
            format: parsed.format,
            descriptor: parsed.desc
        });

        if (unusedFormatsSoFar !== null) {
            unusedFormatsSoFar.remove(parsed.formatName);
        }
    });

    if (unusedFormatsOpt !== undefined) {
        unusedFormatsSoFar.each(function(name, format) {
            unusedFormatsOpt.push({name: name, format: format});
        });
    }

    return {parsed: videos, unparsed: unparsed, blacklisted: blacklisted};
};


/**
 * @param {Array} unparsed
 */
vodpile.logUnparsed = function(unparsed) {
    var i;
    for (i = 0; i < unparsed.length; ++i) {
        console.log('Unparseable title: ' + unparsed[i].title);
    }
};


vodpile.prettyPrintVideoTitle = function(v, startIndex) {
    var result = [];
    if (startIndex === undefined) {
        startIndex = 0;
    }
    vodpile.enumerate(v.format.hierarchy, function(i, level) {
        if (i < startIndex) {
            return;
        }
        if (i === 0) {
            result.push(v.descriptor[level]);
        } else {
            result.push(level + ' ' + v.descriptor[level]);
        }
    });
    return result.join(' ');
};


vodpile.consoleLogVideos = function(videos) {
    videos.each(function(id, v) {
        console.log(id + ': ' + vodpile.toDebugString(v.descriptor));
    });
};


/**
 * @param {vodpile.Dict} rawVideos
 * @param {Array} unparsed output array onto which fetched videos with
 *     unparseable titles will be pushed.
 */
vodpile.handleVideos = function(rawVideos, unparsed) {
    var parseResult = vodpile.parseVideos(rawVideos);
    unparsed.push.apply(parseResult.unparsed);
    vodpile.setupEmbed(parseResult.parsed);
};


vodpile.embedVideo = function(parent, embedHTML) {
    parent.innerHTML = embedHTML;
    vodpile.eachChildElement(parent, function(child) {
        if (child.tagName !== 'OBJECT') {
            return;
        }
        child.setAttribute('width', '100%');
        child.setAttribute('height', '100%');
    });
};

/**
 * A HierarchyForest is a forest of trees whose nodes are levels in the
 * hierarchies described by vodpile.TITLE_FORMATS.
 *
 * @constructor
 */
vodpile.HierarchyForest = function(videos) {
    this.videos_ = videos;
    this.roots_ = {};
    var thisObj = this;
    videos.each(function(id, v) {
        var rootType = v.format.hierarchy[0];
        var rootNode = thisObj.roots_[rootType];
        if (rootNode === undefined) {
            rootNode = {};
            thisObj.roots_[rootType] = rootNode;
        }
        rootNode[v.descriptor[rootType]] = true;
    });
};

vodpile.HierarchyForest.prototype.roots = function() {
    var roots = [];
    vodpile.eachOwnProperty(this.roots_, function(rootType, rootValues) {
        vodpile.eachOwnProperty(rootValues, function(v, dummy) {
            roots.push({type: rootType, value: v});
        });
    });
    return roots;
};

vodpile.DEFAULT_EMBED_FORMAT = [
    "<object bgcolor='#000000' ",
    "data='http://www.twitch.tv/widgets/archive_embed_player.swf' ",
    "id='clip_embed_player_flash' ",
    "type='application/x-shockwave-flash'>",
    "<param name='movie' ",
    "value='http://www.twitch.tv/widgets/archive_embed_player.swf' />",
    "<param name='allowScriptAccess' value='always' />",
    "<param name='allowNetworking' value='all' />",
    "<param name='allowFullScreen' value='true' />",
    "<param name='flashvars' ",
    "value='title=$TITLE",
    "&amp;auto_play=false&amp;start_volume=25&amp;archive_id=$ARCHIVE_ID' />",
    "</object>"
].join('');

vodpile.makeDefaultEmbed = function(title, archiveId) {
    return vodpile.DEFAULT_EMBED_FORMAT
        .replace('$TITLE', encodeURIComponent(title))
        .replace('$ARCHIVE_ID', encodeURIComponent(archiveId));
};

vodpile.extractArchiveId = function(url) {
    var split = url.split('/');
    return split[split.length - 1];
};

/**
 * @param {vodpile.Dict} videos dict mapping from video IDs to internal video
 *     objects.
 */
vodpile.setupEmbed = function(videos) {
    var arrowsDiv = document.getElementById('navArrows');
    var dropdownsDiv = document.getElementById('navDropdowns');
    var watchDiv = document.getElementById('watch');

    // Set up root selectbox.
    var forest = new vodpile.HierarchyForest(videos);
    var roots = forest.roots();
    var rootSelect = document.createElement('select');
    rootSelect.setAttribute('id', 'dropdownRoot');
    vodpile.each(roots, function(root) {
        var opt = document.createElement('option');
        var label = root.type + ' - ' + root.value;
        opt.setAttribute('value', label);
        opt.appendChild(document.createTextNode(label));
        rootSelect.appendChild(opt);
    });
    dropdownsDiv.appendChild(rootSelect);

    // On change, populate a new dropdown with all matching videos.
    $(rootSelect).change(function(event) {
        // Pick videos which match root selection. 
        var root = roots[rootSelect.selectedIndex];
        var matchingVideos = [];
        videos.each(function(id, v) {
            if ((v.format.hierarchy[0] === root.type) &&
                (v.descriptor[root.type] === root.value)) {
                matchingVideos.push(v);
            }
        });
        // Sort videos by ascending time.
        matchingVideos.sort(function(v, w) {
            // Hack: Twitch always returns UTC time, and lexicographic sorting
            // of UTC ISO 8601 strings is the same as the time sorting.
            var vt = v.rawVideo.recorded_at;
            var wt = w.rawVideo.recorded_at;
            return (vt < wt ? -1 :
                    vt > wt ? 1 :
                    0);
        });
        vodpile.WTF.when(matchingVideos.length === 0);

        // Reset and prepare textbox.
        $('#dropdownLeaf').remove();
        var SEARCH_PROMPT = 'Type to search - for example, "Group A"';
        var textbox = document.createElement('input');
        textbox.setAttribute('id', 'dropdownLeaf');
        textbox.setAttribute('type', 'text');
        textbox.setAttribute('class', 'prompt');
        textbox.value = SEARCH_PROMPT;
        var lastSearchTitleToVideo = [{}];
        $(textbox).autocomplete({
            autofocus: true,
            minLength: 0,
            source: function(req, resp) {
                var term = req.term.toLowerCase().trim();
                var results = [];
                lastSearchTitleToVideo.pop();
                lastSearchTitleToVideo.push({});
                vodpile.each(matchingVideos, function(v) {
                    var prettyTitle = vodpile.prettyPrintVideoTitle(v, 1);
                    if ((req.term === '') ||
                        (-1 !== prettyTitle.toLowerCase().indexOf(term))) {
                        var uniqueTitle = prettyTitle;
                        var uniqueIndex = 2;
                        while (lastSearchTitleToVideo[0][uniqueTitle]) {
                            uniqueTitle = (
                                prettyTitle + ' (' + uniqueIndex + ')');
                            ++uniqueIndex;
                        }
                        lastSearchTitleToVideo[0][uniqueTitle] = v;
                        results.push(uniqueTitle);
                    }
                });
                results.sort();
                resp(results);
            },
            select: function(event, ui) {
                var video = lastSearchTitleToVideo[0][ui.item.value];
                console.log(video);
                if (video.rawVideo.embed) {
                    vodpile.embedVideo(watchDiv, video.rawVideo.embed);
                } else {
                    vodpile.embedVideo(
                        watchDiv,
                        vodpile.makeDefaultEmbed(
                            video.rawVideo.title,
                            vodpile.extractArchiveId(video.rawVideo.url)));
                }
            }
        }).focusin(function(event) {
            if (textbox.value === SEARCH_PROMPT) {
                textbox.value = '';
                $(textbox).removeClass('prompt');
            }
            $(textbox).autocomplete('search');
        }).focusout(function(event) {
            if (textbox.value === '') {
                textbox.value = SEARCH_PROMPT;
                $(textbox).addClass('prompt');
            }
        });
        dropdownsDiv.appendChild(textbox);
    });
    $(rootSelect).change();  // Trigger a root selection change immediately.
};


/**
 * Receives the callback from Twitch.init(); effectively the main() function.
 */
vodpile.init = function(error, status) {
    if (error) {
        console.log(error);
        return;  // TODO(keunwoo): show useful error to the user
    }
    var unparsed = [];  // videos with unparseable titles
    if (vodpile.SKIP_CACHED_DATA) {
        vodpile.fetchVideos('gsl', function(vids) {
            vodpile.handleVideos(vids, unparsed);
            vodpile.logUnparsed(unparsed);
        });
    } else {
        $.getJSON(vodpile.CACHED_DATA_PATH, function(data) {
            vodpile.handleVideos(vodpile.videoListToDict(data), unparsed);
            vodpile.logUnparsed(unparsed);
        });
    }
};


/* global $, Twitch, console */
