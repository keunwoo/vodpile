var vodpile = vodpile || {};

/**
 * When true, load data directly from Twitch instead of using the cached
 * data checked into our repository.
 */
vodpile.SKIP_CACHED_DATA = false;

vodpile.CACHED_DATA_PATH = "data/gsl-pastBroadcasts.json";

/**
 * On data load, we stash parsed data here (used only for debugging).
 */
vodpile.data = null;


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

vodpile.Dict.prototype.values = function() {
    var result = [];
    this.each(function(_, v) {
        result.push(v);
    });
    return result;
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

vodpile.shallowCopy = function(obj) {
    var result = {};
    vodpile.eachOwnProperty(obj, function(k, v) {
        result[k] = v;
    });
    return result;
};

/**
 * @return true iff all own properties present in left are present and have the
 *     same (===) values in the right.  Note that this operation is asymmetric;
 *     fields present in right that are not present in left have no effect on
 *     the result.
 */
vodpile.leftOwnPropertiesEqRight = function(left, right) {
    var diff = false;
    vodpile.eachOwnProperty(left, function(name, value) {
        diff = right[name] !== value;
        return diff;
    });
    return !diff;
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
 * Every descriptor should have fields which specify a prefix of one of these
 * hierarchies.
 */
vodpile.HIERARCHIES = {
    // Early stages have a group; for example, "Round of 32, Group A".
    FULL: ['Year', 'Season', 'League', 'Round', 'Group', 'Match', 'Set'],

    // Later tournament stages have no group name: "Round of 4"
    NO_GROUP: ['Year', 'Season', 'League', 'Round', 'Match', 'Set'],

    // Tournament finals consist of just 1 match.
    FINALS: ['Year', 'Season', 'League', 'Round', 'Set'],

    // In addition to match-specific videos, sometimes GOM uploads all the
    // matches for a day in a single video chunk.
    DAY: ['Year', 'Season', 'League', 'Round', 'Day'],

    // A few videos in the archive are split into "parts".
    GROUP_PART: ['Year', 'Season', 'League', 'Round', 'Group', 'Part']
};

/**
 * Video "descriptors" are objects with fields whose names correspond to (a
 * prefix of) levels in one of the hierarchies described above, plus the
 * additional field 'Hierarchy' which points to the hierarchy to which the
 * descriptor should belong.
 *
 * An example descriptor:
 *
 *   {
 *     Hierarchy: vodpile.HIERARCHIES.FULL,
 *     Year: '2014',
 *     Season: '1',
 *     Round: '32',
 *     Group: 'K'
 *   }
 *
 * Descriptors are what we produce by heuristically parsing video titles.
 *
 * Note that we currently require all non-'Hierarchy' descriptor field values to
 * be strings for consistency.  Clients that wish to treat field values as
 * numbers should convert them at processing time.
 *
 * @return a fresh video descriptor object with some fields populated with
 *     default values; these values may be overridden during title parsing.
 */
vodpile.newVideoDesc = function() {
    return {
        'Hierarchy': vodpile.HIERARCHIES.FULL,
        'Year': '2014'
    };
};

/**
 * @enum
 */
vodpile.TITLE_FORMATS = {

    //////////////////////////////////////////////////////////////////////
    // Season-agnostic formats

    'GSL_2014_LEAGUE_ROUND_MATCH_SET_SEASON': {
        constants: {
            'Hierarchy': vodpile.HIERARCHIES.NO_GROUP
        },
        matchFields: ['League', 'Round', 'Match', 'Set', 'Season'],
        regex: new RegExp([
            '^(Code [AS]) Ro(\\d+) Match (\\d+) Set (\\d+)',
            ', 2014 GSL Season (\\d+).mp4'
        ].join(''))
    },

    'GSL_2014_SEASON_LEAGUE_ROUND_GROUP': {
        matchFields: ['Season', 'League', 'Round', 'Group'],
        regex: new RegExp(
            '^(?:2014 GSL Season (\\d+) )?(Code [AS]) Ro(\\d+) Group (\\w+)$')
    },

    'GSL_2014_SEASON_LEAGUE_GROUP': {
        constants: {
            // These titles look ambiguous (they look like they could refer to
            // Ro16, which also uses letter-named groups), but this format was
            // historically only used for Ro32 matches.
            'Round': '32'
        },
        matchFields: ['Season', 'League', 'Group'],
        regex: new RegExp(
            '^2014 GSL Season (\\d+) (Code [AS]) Group (\\w+)$')
    },

    'GSL_2014_SEASON_LEAGUE_GROUP_MATCH_SET': {
        constants: {
            // See note on GSL_2014_SEASON_LEAGUE_GROUP
            'Round': '32'
        },
        matchFields: ['Season', 'League', 'Group', 'Match', 'Set'],
        regex: new RegExp([
            '^2014 GSL Season (\\d+) ',
            '(Code [AS]) Group (\\w+) [Mm]atch(\\d+) [Ss]et(\\d+)(?:.mp4)?$'
        ].join(''))
    },

    'GSL_2014_LEAGUE_GROUP_MATCH_SET_SEASON': {
        constants: {
            // See note on GSL_2014_SEASON_LEAGUE_GROUP
            'Round': '32'
        },
        matchFields: ['League', 'Group', 'Match', 'Set', 'Season'],
        regex: new RegExp([
            '^(Code [AS]) Group (\\w+) [Mm]atch ?(\\d+) [Ss]et ?(\\d+), ',
            '2014 GSL Season (\\d+)(?:.mp4)*$'
        ].join(''))
    },

    'GSL_2014_ROUND_GROUP_MATCHSET': {
        matchFields: ['League', 'Round', 'Group', 'Match', 'Set', 'Season'],
        regex: new RegExp([
            '^(Code [AS]) Ro(\\d+) Group (\\w+) Match (\\d+) Set (\\d+),',
            ' 2014 GSL Season (\\d+)(?:.mp4)?$'
        ].join(''))
    },

    'GSL_2014_FINALS_SET': {
        constants: {
            'Round': '2',
            'Hierarchy': vodpile.HIERARCHIES.FINALS
        },
        matchFields: ['League', 'Set', 'Season'],
        regex: new RegExp(
            '^(Code [AS]) Final Set (\\d+), 2014 GSL Season (\\d+).mp4')
    },

    'GSL_2014_FINALS': {
        constants: {
            'Round': '2',
            'Hierarchy': vodpile.HIERARCHIES.FINALS
        },
        matchFields: ['Season', 'League'],
        regex: new RegExp('^2014 GSL Season (\\d+) (Code [AS]) Grand Finals$')
    },

    //////////////////////////////////////////////////////////////////////
    // Season 1 formats

    'GSL_2014_S1_GROUP_MATCHSET_ALT': {
        constants: {
            'Season': '1',
            'Round': '32'
        },
        matchFields: ['League', 'Group', 'Match', 'Set'],
        regex: new RegExp([
            '^(Code S) 32[^ ]+ Group (\\w+) Match (\\d+) Set (\\d+)',
            ', 2014 GSL Season 1\\..*$'
        ].join(''))
    },

    'GSL_2014_S1_GROUP_PART': {
        constants: {
            'Hierarchy': vodpile.HIERARCHIES.GROUP_PART,
            'Season': '1',
            'Round': '32'
        },
        matchFields: ['League', 'Group', 'Part'],
        regex: /^2014 GSL Season 1 (Code [AS]) Group (\w+) Part (\d+)$/
    },

    'GSL_2014_S1_ROUND_MATCH': {
        constants: {
            'Hierarchy': vodpile.HIERARCHIES.NO_GROUP,
            'Season': '1'
        },
        matchFields: ['League', 'Round', 'Match'],
        regex: new RegExp(
            '^(?:2014 GSL Season 1 )?(Code [AS]) Ro(\\d+) [Mm]atch(\\d+)$')
    },

    'GSL_2014_SEASON_LEAGUE_ROUND_DAY': {
        constants: {
            'Hierarchy': vodpile.HIERARCHIES.DAY
        },
        matchFields: ['Season', 'League', 'Round', 'Day'],
        regex: new RegExp(
            '^2014 GSL Season (\\d+) (Code [AS]) Ro(\\d+) Day(\\d+)$')
    }
};


/**
 * Tries to parse the given title using all known formats.
 *
 * @param {string} title
 * @return On failure, null; on success, an object
 *       {format: fmt, formatName: string, desc: descriptor}
 *     where fmt is a value in the vodpile.TITLE_FORMATS enum, formatName is the
 *     key in vodpile.TITLE_FORMATS corresponding to fmt, and desc is the
 *     descriptor assembled by parsing the title using the matched format.
 */
vodpile.parseVideoTitle = function(title) {
    var result = null;
    vodpile.eachOwnProperty(vodpile.TITLE_FORMATS, function(name, format) {
        var m = title.match(format.regex);
        if (!m) {
            return false;  // continue
        }

        var desc = vodpile.newVideoDesc();

        // Mix matched fields into desc.
        var i;
        for (i = 0; i < format.matchFields.length; ++i) {
            desc[format.matchFields[i]] = m[i + 1];
        }

        // Mix constant fields into desc.
        if (format.constants) {
            vodpile.eachOwnProperty(format.constants, function(name, value) {
                desc[name] = value;
            });
        }

        result = {format: format, formatName: name, desc: desc};
        return true;
    });
    return result;
};


/**
 * Some videos' titles are mislabeled.  This encodes some manual
 * corrections for the descriptors we build for those video IDs.
 */
vodpile.POST_PARSE_CORRECTIONS = {
    'a495601785': function(desc) {
        desc['Season'] = '1';
        desc['Set'] = '2';
    },
    'a495601787': function(desc) {
        desc['Season'] = '1';
        desc['Set'] = '3';
    }
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

        if (vodpile.POST_PARSE_CORRECTIONS[id]) {
            vodpile.POST_PARSE_CORRECTIONS[id](parsed.desc);
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
 * @return a string describing the first sanity error found in desc; the empty
 *     string '' if no sanity error is found.
 */
vodpile.findSanityErrorInDescriptor = function(desc) {
    if (!desc['Hierarchy']) {
        return 'missing hierarchy';
    }
    var hierarchy = desc['Hierarchy'];

    // Check that a prefix of the hierarchy is filled in.
    var fieldCount = 0;
    var firstMissingLevel = null;
    var i, level;
    for (i = 0; i < hierarchy.length; ++i) {
        level = hierarchy[i];
        if (firstMissingLevel === null) {
            if (desc[level]) {
                ++fieldCount;
            } else {
                firstMissingLevel = level;
            }
        } else {
            if (desc[level]) {
                return (firstMissingLevel + ' is missing, but ' +
                        level + ' is present');
            }
        }
    }

    // Check that the matched hierarchy prefix is nontrivial (year, league,
    // season, and at least 1 other field)
    var minFields = 4;
    if (fieldCount >= minFields) {
        return '';
    } else {
        return 'fewer than ' + minFields + ' fields found';
    }
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


/**
 * For some hierarchy levels, the default "[levelname] [value]" format
 * looks ugly; we special-case formatting for those levels here.
 */
vodpile.LEVEL_FORMATS = {
    'Year': function(year) { return year; },
    'League': function(league) { return league; },
    'Round': function(roundStr) {
        var round = parseInt(roundStr, 10);
        if (round === 2) {
            return 'Finals';
        } else if (round === 4) {
            return 'Ro4 semifinals';
        } else {
            return 'Ro' + roundStr;
        }
    }
};


vodpile.prettyPrintDescriptorField = function(name, value) {
    var formatFn = vodpile.LEVEL_FORMATS[name];
    if (formatFn) {
        return formatFn(value);
    } else {
        return name + ' ' + value;
    }
};


vodpile.prettyPrintVideoTitle = function(v, startIndex) {
    var result = [];
    if (startIndex === undefined) {
        startIndex = 0;
    }
    vodpile.enumerate(v.descriptor['Hierarchy'], function(i, level) {
        if (i < startIndex) {
            return;
        }
        var format;
        if (v.descriptor[level]) {
            result.push(vodpile.prettyPrintDescriptorField(
                level, v.descriptor[level]));
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

    // Stash/print some data for debugging.
    vodpile.data = parseResult;
    console.log('Sanity checking (non-sane descriptors will be logged)...');
    var sanityErrorCount = 0;
    parseResult.parsed.each(function(id, v) {
        var sanityError = vodpile.findSanityErrorInDescriptor(v.descriptor);
        if (sanityError !== '') {
            console.log('!! ' + sanityError + 
                        ' - title was: "' + v.rawVideo.title + '"');
            console.log(v.descriptor);
            ++sanityErrorCount;
        }
    });
    console.log('...done sanity checks (' + sanityErrorCount + ' errors)');
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
 * Compares two of our internal video objects by time.
 */
vodpile.compareByTime = function(v, w) {
    // Hack: Twitch always returns UTC time, and lexicographic sorting
    // of UTC ISO 8601 strings is the same as the time sorting.
    var vt = v.rawVideo.recorded_at;
    var wt = w.rawVideo.recorded_at;
    return (vt < wt ? -1 :
            vt > wt ? 1 :
            0);
};


/**
 * Provides query operations over a collection of videos.
 *
 * @constructor
 * @param videos dict mapping from video IDs to internal video objects.
 */
vodpile.VideoIndex = function(videos) {
    this.videos_ = videos;
    this.indexByTime_ = null;  // Populated on-demand.
};

/**
 * Enumerates the live combinations of the requested fields in this index.
 *
 * @param {Array.<string>} fields array whose elements name fields whose
 *     combinations in this index should be enumerated.
 * @return {Array.<Object>} elements of this array are objects whose fields
 *     are given by the field parameter; one such object appears for each
 *     combination of field values appears in this index.  For example,
 *     if fields === ['Year', 'League'], the result might be the array
 *       [{'Year': '2014', 'League': 'Code A'},
 *        {'Year': '2014', 'League': 'Code S'}]
 *     if those are the only combinations of 'Year' and 'League' which appear
 *     in the values in this index.  If there are some values with 'Year' but
 *     not 'League' or vice versa, a record without the missing field will
 *     appear in the result, for example
 *        {'Year': 2013'}
 */
vodpile.VideoIndex.prototype.combinations = function(fields) {
    var result = [];

    this.videos_.each(function(_, v) {
        var desc = v.descriptor;

        // Assemble current descriptor.
        var current = {};
        var i, f;
        var setSomeField = false;
        for (i = 0; i < fields.length; ++i) {
            f = fields[i];
            if (desc[f] !== undefined) {
                current[f] = desc[f];
                setSomeField = true;
            }
        }

        // If descriptor is empty, don't do anything.
        if (!setSomeField) {
            return;
        }

        // Add it to the result, if nothing like it is already present.
        // TODO(keunwoo): O(n*|result|); maybe convert this to hashing
        var alreadyPresent = false;
        var j, r, allFieldsMatch;
        for (i = 0; i < result.length; ++i) {
            r = result[i];
            allFieldsMatch = true;
            for (j = 0; j < fields.length; ++j) {
                if (r[fields[j]] !== current[fields[j]]) {
                    allFieldsMatch = false;
                    break;
                }
            }
            alreadyPresent |= allFieldsMatch;
            if (alreadyPresent) {
                break;
            }
        }
        if (!alreadyPresent) {
            result.push(current);
        }
    });

    return result;
};

/**
 * @param query object whose fields are level-to-value mappings; for example
 *     {'Year': '2014', 'Season': 2'} will return a list of all videos with the
 *     given Year and Season.
 * @return {Array} video objects matching query
 */
vodpile.VideoIndex.prototype.get = function(query) {
    // TODO(keunwoo): Implement indexing, instead of iterating over the entire
    // set every time we query.
    var matchesQuery = function(desc) {
        return vodpile.leftOwnPropertiesEqRight(query, desc);
    };

    var result = [];
    this.videos_.each(function(_, v) {
        if (matchesQuery(v.descriptor)) {
            result.push(v);
        }
    });
    return result;
};

/**
 * @return {Array} of videos ordered by ascending recorded_at time.
 */
vodpile.VideoIndex.prototype.byTime = function() {
    if (this.indexByTime_ === null) {
        this.indexByTime_ = this.videos_.values();
        this.indexByTime_.sort(vodpile.compareByTime);
    }
    return this.indexByTime_.slice();
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
    var index = new vodpile.VideoIndex(videos);
    var rootFields = ['Year', 'Season', 'League'];
    var combinations = index.combinations(rootFields);
    var rootSelect = document.createElement('select');
    rootSelect.setAttribute('id', 'dropdownRoot');
    vodpile.each(combinations, function(comb) {
        var opt = document.createElement('option');
        var labelParts = [];
        vodpile.each(rootFields, function(part) {
            labelParts.push(vodpile.prettyPrintDescriptorField(
                part,
                comb[part] === undefined ? '' : comb[part]));
        });
        var label = labelParts.join(' ');
        opt.setAttribute('value', label);
        opt.appendChild(document.createTextNode(label));
        rootSelect.appendChild(opt);
    });
    dropdownsDiv.appendChild(rootSelect);

    // On change, populate a new dropdown with all matching videos.
    $(rootSelect).change(function(event) {
        // Pick videos which match root selection. 
        var comb = combinations[rootSelect.selectedIndex];
        var query = vodpile.shallowCopy(comb);
        var matchingVideos = index.get(query);
        // Sort videos by ascending time.
        matchingVideos.sort(vodpile.compareByTime);
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
                    var prettyTitle = vodpile.prettyPrintVideoTitle(
                        v, rootFields.length);
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

    // Pick the initial value for the root selector: the combination
    // corresponding to the most recent video.  Note that we rely here on the
    // fact that our rootFields are selected to include all videos; if this were
    // not true, we would need to do some more expensive queries here.
    var byTime = index.byTime();
    vodpile.WTF.when(byTime.length === 0);
    var mostRecent = byTime[byTime.length - 1];
    var initialComb = {};
    var i;
    for (i = 0; i < rootFields.length; ++i) {
        initialComb[rootFields[i]] = mostRecent.descriptor[rootFields[i]];
    }
    var initialIndex = 0;
    for (i = 0; i < combinations.length; ++i) {
        if (vodpile.leftOwnPropertiesEqRight(initialComb, combinations[i])) {
            initialIndex = i;
            break;
        }
    }
    if (initialIndex !== 0) {
        rootSelect.selectedIndex = initialIndex;
    }
    // Trigger a dummy root selection change immediately.
    $(rootSelect).change();
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
