var vodpile = vodpile || {};


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
 * Utility string-to-value dictionary accumulator class.
 * @constructor
 * @template T
 */
vodpile.Dict = function() {
    this.map_ = {};
    this.keys_ = [];
};

/**
 * @param {string} k
 * @param {T} v
 */
vodpile.Dict.prototype.put = function(k, v) {
    vodpile.WTF.when(typeof k !== 'string');
    vodpile.WTF.when(v === undefined);
    var lookup = this.map_[k];
    if (lookup === undefined) {
        this.keys_.push(k);
    }
    this.map_[k] = v;
};

/**
 * @param {string} k
 * @param {?T=} ifAbsent
 * @return {T}
 */
vodpile.Dict.prototype.get = function(k, ifAbsent) {
    var lookup = this.map_[k];
    if (lookup === undefined) {
        this.put(k, ifAbsent);
        lookup = ifAbsent;
    }
    return lookup;
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
        f(k, this.map_[k]);
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
            f(prop, obj[prop]);
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
                                     dest, callback) {
    Twitch.api({
        method: 'channels/gsl/videos',
        params: {
            limit: limit,
            offset: offset,
            // TODO(keunwoo): get both broadcasts and highlights
            broadcasts: true
        }
    }, function(error, result) {
        if (error) {
            console.log('Error fetching videos: ' + error);
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


vodpile.GSL_2014_S1_GROUP = {
    id: 'GSL_2014_S1_GROUP',
    hierarchy: ['League', 'Group'],
    regex: /^2014 GSL Season 1 (Code [AS]) Group (\w+)$/
};

vodpile.GSL_2014_S1_GROUP_PART = {
    id: 'GSL_2014_S1_GROUP_PART',
    hierarchy: ['League', 'Group', 'Part'],
    regex: /^2014 GSL Season 1 (Code [AS]) Group (\w+) Part (\d+)$/
};

vodpile.GSL_2014_S1_GROUP_MATCHSET = {
    id: 'GSL_2014_S1_GROUP_MATCHSET',
    hierarchy: ['League', 'Group', 'Match', 'Set'],
    regex: /^(?:2014 GSL Season 1 )?(Code [AS]) Group (\w+) [Mm]atch(\d+) [Ss]et(\d+)(?:, 2014 GSL Season 1)?(?:.mp4)?$/
};

/**
 * Ordered from least-specific to most-specific.
 */
vodpile.TITLE_FORMATS = [
    vodpile.GSL_2014_S1_GROUP,
    vodpile.GSL_2014_S1_GROUP_PART,
    vodpile.GSL_2014_S1_GROUP_MATCHSET
];

/**
 * Heuristically parse raw videos' titles and process into video objects.
 * @param {vodpile.Dict} dict mapping from video IDs to raw video metadata
 *     objects as returned by the Twitch API.
 * @return {vodpile.Dict} mapping from video IDs to our internal video objects,
 *     which wrap the raw video metadata with some fields describing the result
 *     of parsing.
 */
vodpile.parseVideoTitles = function(rawVideos) {
    var videos = new vodpile.Dict();
    rawVideos.each(function(id, v) {
        var i, j, m, format, recognized, desc;
        if (!v.title) {
            console.log('Skipping video with no title.');
            return;
        }
        recognized = false;
        for (i = 0; i < vodpile.TITLE_FORMATS.length; ++i) {
            format = vodpile.TITLE_FORMATS[i];
            m = v.title.match(format.regex);
            if (!m) {
                continue;
            }
            recognized = true;
            desc = {};
            for (j = 0; j < format.hierarchy.length; ++j) {
                desc[format.hierarchy[j]] = m[j + 1];
            }
            videos.put(id, {
                rawVideo: v,
                format: format,
                descriptor: desc
            });
            break;
        }
        if (!recognized) {
            console.log('Could not parse video title: "' + v.title + '"; ' +
                        'url was: ' + v.url);
        }
    });
    return videos;
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
 */
vodpile.handleVideos = function(rawVideos) {
    var videos = vodpile.parseVideoTitles(rawVideos);
    vodpile.setupEmbed(videos);
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
        vodpile.WTF.when(matchingVideos.length === 0);

        // Reset and prepare textbox.
        $('#dropdownLeaf').remove();
        var SEARCH_PROMPT = 'Type to search - for example, "Group K"';
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
    if (vodpile.DEMO_DATA) {
        vodpile.handleVideos(vodpile.makeDemoDataDict());
    } else {
        vodpile.fetchVideos('gsl', vodpile.handleVideos);
    }
};


/* global $, Twitch, console */
