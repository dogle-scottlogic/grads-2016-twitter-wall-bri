module.exports = function(client, fs, eventConfigFile, mkdirp) {

    var tweetStore = [];
    var tweetUpdates = [];
    var hashtags = [];
    var mentions = [];
    var blockedUsers = [];
    var speakers = [];
    var userIDs = [];
    var officialUser;
    var inApprovalMode = false;

    var rateLimitDir = "./server/temp/";
    var rateLimitFile = rateLimitDir + "rateLimitRemaining.json";

    var logDir = "./server/logs/";
    var logTweetsFilename = logDir + "tweets.json";
    var logUpdatesFilename = logDir + "updates.json";
    var logTweetsFile;
    var logUpdatesFile;
    var logTweetsCount = 0;
    var logUpdatesCount = 0;

    var stream;

    function tweetType(tweet) {
        if (tweet.user.screen_name === officialUser) {
            return "official";
        }
        var foundHashtag = hashtags.reduce(function(found, hashtag) {
            return found || tweet.entities.hashtags.reduce(function(match, tweetHashtag) {
                return match || hashtag.slice(1).toUpperCase() === tweetHashtag.text.toUpperCase();
            }, false);
        }, false);
        if (foundHashtag) {
            return "tagged";
        }
        var foundMention = mentions.reduce(function(found, mention) {
            return found || tweet.entities.user_mentions.reduce(function(match, userMention) {
                return match || mention.slice(1).toUpperCase() === userMention.screen_name.toUpperCase();
            }, false);
        }, false);
        if (foundMention) {
            return "tagged";
        }
        return "";
    }

    function addTweetUpdate(type, props) {
        var newUpdate = {
            type: type,
            since: new Date(),
        };
        Object.keys(props).forEach(function(propKey) {
            newUpdate[propKey] = props[propKey];
        });
        tweetUpdates.push(newUpdate);
        logUpdates([newUpdate]);
    }

    function addTweetItem(tweets, tag) {
        if (tweets.length === 0) {
            return;
        }
        addTweetUpdate("new_tweets", {
            tag: tag,
            startIdx: tweetStore.length,
        });
        tweetStore = tweetStore.concat(tweets);
        if (inApprovalMode) {
            tweets.forEach(function(tweet) {
                setDeletedStatus(tweet.id_str, true);
            });
        }
        logTweets(tweets);
    }

    function setApprovalMode(approveTweets) {
        inApprovalMode = approveTweets;
    }

    function getApprovalMode() {
        return {
            status: inApprovalMode
        };
    }

    function updateInteractions(visibleTweets, callback) {
        var interactionUpdates = {
            favourites: [],
            retweets: []
        };
        var tweets = JSON.parse(visibleTweets);
        var ids = tweets.map(function(tweet) {
            return tweet.id_str;
        });
        var params = {
            id: ids.join(),
            trim_user: true

        };
        if (apiResources["statuses/lookup"].requestsRemaining > 0) {
            client.get("statuses/lookup", params, function(error, data, response) {
                if (!error) {
                    data.forEach(function(tweet) {
                        var previous = tweets.find(function(inTweet) {
                            return tweet.id_str === inTweet.id_str;
                        });
                        if (previous.favorite_count !== tweet.favorite_count) {
                            interactionUpdates.favourites.push({
                                id: tweet.id_str,
                                value: tweet.favorite_count
                            });
                        }
                        if (previous.retweet_count !== tweet.retweet_count) {
                            interactionUpdates.retweets.push({
                                id: tweet.id_str,
                                value: tweet.retweet_count
                            });
                        }
                    });
                    apiResources["statuses/lookup"].requestsRemaining = response.headers["x-rate-limit-remaining"];
                    apiResources["statuses/lookup"].resetTime = (Number(response.headers["x-rate-limit-reset"]) + 1) * 1000;
                    callback(null, interactionUpdates);
                } else {
                    console.log("Interaction update error:");
                    console.log(error);
                    callback(error);
                }
            });
        } else {
            var lookupTimer = setTimeout(function() {
                apiResources["statuses/lookup"].requestsRemaining = 1;
            }, apiResources["statuses/lookup"].resetTime - new Date().getTime());
            callback("too many API requests right now");
        }
    }

    function findLast(arr, predicate, thisArg) {
        for (var idx = arr.length - 1; idx >= 0; idx--) {
            if (predicate.call(thisArg, arr[idx], idx, arr)) {
                return arr[idx];
            }
        }
    }

    function setTweetStatus(tweetId, status) {
        var modifiedTweet = findLast(tweetStore, function(tweet) {
            return tweet.id_str === tweetId;
        });
        if (!modifiedTweet) {
            throw new Error("Cannot modify tweet that the server does not have.");
        }
        // Ignore the update if everything in `status` is already set for the tweet
        addTweetUpdate("tweet_status", {
            id: tweetId,
            status: status,
        });
    }

    function setDeletedStatus(tweetId, deleted) {
        setTweetStatus(tweetId, {
            deleted: deleted
        });
    }

    function setPinnedStatus(tweetId, pinned) {
        setTweetStatus(tweetId, {
            pinned: pinned
        });
    }

    // Compares two strings that represent numbers of greater size than can be handled as `number` types without loss
    // of precision, and returns true if the first is numerically greater than the second
    function idStrComp(a, b) {
        if (Number(a) === Number(b)) {
            return a > b;
        }
        return Number(a) > Number(b);
    }

    var apiResources = {
        "search/tweets": {
            since_id: "0",
            basePath: "search",
            requestsRemaining: 0,
            resetTime: 0,
            addData: function(tweets) {
                this.since_id = tweets.statuses.reduce(function(since, currTweet) {
                    return idStrComp(since, currTweet.id_str) ? since : currTweet.id_str;
                }, this.since_id);
                var taggedTweets = tweets.statuses.filter(function(tweet) {
                    return tweetType(tweet) === "tagged";
                });
                addTweetItem(taggedTweets, "tagged");
            }
        },
        "statuses/user_timeline": {
            since_id: "0",
            basePath: "statuses",
            requestsRemaining: 0,
            resetTime: 0,
            addData: function(tweets) {
                this.since_id = tweets.reduce(function(since, currTweet) {
                    return idStrComp(since, currTweet.id_str) ? since : currTweet.id_str;
                }, this.since_id);
                var officialTweets = tweets.filter(function(tweet) {
                    return tweetType(tweet) === "official";
                });
                addTweetItem(officialTweets, "official");
            }
        },
        "statuses/lookup": {
            basePath: "statuses",
            requestsRemaining: 0,
            resetTime: 0
        },
    };

    var searchUpdater;
    var userUpdater;

    openLogFile(function() {

        loadEventConfig(eventConfigFile, function() {
            var hashtagUpdateFn = tweetResourceGetter("search/tweets", {
                q: hashtags.concat(mentions).join(" OR "),
                tweet_mode: "extended"
            });
            var timelineUpdateFn = tweetResourceGetter("statuses/user_timeline", {
                screen_name: officialUser,
                tweet_mode: "extended"
            });
            // Begins the chain of callbacks defined below
            rateCheckLoop();
            // Callback that loops every 5 seconds until the server has confirmed the ability to safely access the rate
            // limits API; calls `rateSaveLoop` on success
            function rateCheckLoop() {
                checkRateLimitSafety(function(success) {
                    if (success) {
                        getApplicationRateLimits(rateSaveLoop);
                    } else {
                        var loopDelay = 5000;
                        console.log("Could not verify rate limit safety, retrying after " + loopDelay + "ms...");
                        setTimeout(rateCheckLoop, loopDelay);
                    }
                });
            }

            // Callback that receives the rate limit data from `getApplicationRateLimits` and loops every 5 seconds until
            // the server has saved the rate limit data successfully; calls `beginResourceUpdates` on success
            function rateSaveLoop(rateLimitData) {
                mkdirp(rateLimitDir, function(err) {
                    // Count a return value of `EEXIST` as successful, as it means the directory already exists
                    if (!err || err.code === "EEXIST") {
                        fs.writeFile(rateLimitFile, JSON.stringify(rateLimitData), function(err) {
                            if (!err) {
                                beginResourceUpdates();
                            } else {
                                repeatLoop();
                            }
                        });
                    } else {
                        repeatLoop();
                    }
                });

                function repeatLoop() {
                    var loopDelay = 5000;
                    console.log("Could not save rate limit data, retrying after " + loopDelay + "ms...");
                    setTimeout(rateSaveLoop.bind(undefined, rateLimitData), loopDelay);
                }
            }

            // Begins the loop of collecting tweets from the Twitter API
            function beginResourceUpdates() {
                resourceUpdate("search/tweets", hashtagUpdateFn, searchUpdater);
                resourceUpdate("statuses/user_timeline", timelineUpdateFn, userUpdater);
            }
        });

    });

    return {
        getTweetData: getTweetData,
        setDeletedStatus: setDeletedStatus,
        setPinnedStatus: setPinnedStatus,
        setTweetImageHidden: setTweetImageHidden,
        loadTweets: loadTweets,
        getBlockedUsers: getBlockedUsers,
        addBlockedUser: addBlockedUser,
        removeBlockedUser: removeBlockedUser,
        getSpeakers: getSpeakers,
        addSpeaker: addSpeaker,
        removeSpeaker: removeSpeaker,
        displayBlockedTweet: displayBlockedTweet,
        setRetweetDisplayStatus: setRetweetDisplayStatus,
        updateInteractions: updateInteractions,
        setApprovalMode: setApprovalMode,
        getApprovalMode: getApprovalMode,
        closeLogFile: closeLogFile,
    };

    function checkRateLimitSafety(callback) {
        fs.readFile(rateLimitFile, "utf8", function(err, data) {
            var success = false;
            if (err) {
                if (err.code === "ENOENT") {
                    success = true;
                } else {
                    console.log("Error reading rate limit safety file: " + err);
                }
            } else {
                try {
                    var rateLimitInfo = JSON.parse(data);
                    success = (rateLimitInfo.remaining > 1 || new Date() > new Date(rateLimitInfo.resetTime));
                } catch (err) {
                    console.log("Error parsing rate limit safety file: " + err);
                }
            }
            callback(success);
        });
    }

    function getBlockedUsers() {
        return blockedUsers;
    }

    function addBlockedUser(user) {
        if (!blockedUsers.find(function(blockedUser) {
                return blockedUser.screen_name === user.screen_name;
            })) {
            addTweetUpdate("user_block", {
                screen_name: user.screen_name,
                blocked: true,
            });
            blockedUsers.push(user);
        } else {
            console.log("User " + user.screen_name + " already blocked");
        }
    }

    function removeBlockedUser(user) {
        if (!blockedUsers.find(function(blockedUser) {
                return blockedUser.screen_name === user.screen_name;
            })) {
            return;
        }
        addTweetUpdate("user_block", {
            screen_name: user.screen_name,
            blocked: false,
        });
        blockedUsers = blockedUsers.filter(function(usr) {
            return usr.screen_name !== user.screen_name;
        });
    }

    function displayBlockedTweet(tweetId) {
        setTweetStatus(tweetId, {
            display: true
        });
    }

    function setRetweetDisplayStatus(status) {
        addTweetUpdate("retweet_display", {
            status: status
        });
    }

    function setTweetImageHidden(tweetId, hidden) {
        setTweetStatus(tweetId, {
            hide_image: hidden
        });
    }

    function resourceUpdate(apiResource, updateFn, timer) {
        if (apiResources[apiResource].requestsRemaining > 0) {
            updateFn();
            timer = setTimeout(function() {
                resourceUpdate(apiResource, updateFn, timer);
            }, 5000);
        } else {
            timer = setTimeout(function() {
                apiResources[apiResource].requestsRemaining = 1;
                resourceUpdate(apiResource, updateFn, timer);
            }, apiResources[apiResource].resetTime - new Date().getTime());
        }
    }

    function loadTweets(tweets, type) {
        addTweetItem(tweets, type);
    }

    function getTweetStore() {
        return tweetStore;
    }

    function getTweetData(since, maxTweets) {
        since = since || new Date(0);
        var updateIdx = tweetUpdates.findIndex(function(update) {
            return update.since > since;
        });
        if (updateIdx === -1) {
            return {
                tweets: [],
                updates: [],
            };
        }
        var updates = tweetUpdates.slice(updateIdx);
        var newTweetUpdates = updates.filter(function(update) {
            return update.type === "new_tweets";
        });
        var tweets = [];
        if (newTweetUpdates.length > 0) {
            var minStartIdx = tweetStore.length - maxTweets > 0 ? tweetStore.length - maxTweets : 0;
            var startIdx = newTweetUpdates[0].startIdx < minStartIdx ?
                minStartIdx :
                newTweetUpdates[0].startIdx;
            tweets = tweetStore.slice(startIdx);
        }
        return {
            tweets: tweets,
            updates: updates,
        };
    }

    function tweetResourceGetter(resource, query) {
        return getTweetResource.bind(undefined, resource, query);
    }

    function getTweetResource(resource, query) {
        var last_id = apiResources[resource].since_id;
        if (last_id !== "0") {
            query.since_id = last_id;
        }
        client.get(resource, query, function(error, data, response) {
            if (!error) {
                apiResources[resource].requestsRemaining = response.headers["x-rate-limit-remaining"];
                apiResources[resource].resetTime = (Number(response.headers["x-rate-limit-reset"]) + 1) * 1000;
                if (data) {
                    apiResources[resource].addData(data);
                }
            } else {
                if (response && response.headers && response.headers["x-rate-limit-remaining"]) {
                    apiResources[resource].requestsRemaining = response.headers["x-rate-limit-remaining"];
                    apiResources[resource].resetTime = (Number(response.headers["x-rate-limit-reset"]) + 1) * 1000;
                } else {
                    apiResources[resource].requestsRemaining -= 1;
                }
                console.log("Tweet resource '" + resource + "' error:");
                console.log(error);
            }
        });
    }

    function getApplicationRateLimits(callback) {
        var resourceNames = Object.keys(apiResources);
        var resourcePaths = [];
        resourceNames.forEach(function(resourceName) {
            if (resourcePaths.indexOf(apiResources[resourceName].basePath) === -1) {
                resourcePaths.push(apiResources[resourceName].basePath);
            }
        });
        var query = {
            resources: resourcePaths.join(","),
        };
        client.get("application/rate_limit_status", query, function(error, data, response) {
            var rateLimitData = {
                remaining: response.headers["x-rate-limit-remaining"],
                resetTime: (Number(response.headers["x-rate-limit-reset"]) + 1) * 1000,
            };
            if (!error && data) {
                resourceNames.forEach(function(name) {
                    var resourceProfile = data.resources[apiResources[name].basePath]["/" + name];
                    apiResources[name].requestsRemaining = resourceProfile.remaining;
                    apiResources[name].resetTime = (resourceProfile.reset + 1) * 1000;
                });
            } else {
                throw new Error("Failed to get safe twitter rate limits.");
            }
            callback(rateLimitData);
        });
    }

    function loadEventConfig(location, callback) {
        fs.readFile(location, "utf8", function(err, data) {
            if (err) {
                console.log("Error reading event config file" + err);
            } else {
                try {
                    var loadedSpeakers = JSON.parse(data).speakers;
                    var loadTime = new Date();
                    loadedSpeakers.forEach(function(loadedSpeaker) {
                        addTweetUpdate("speaker_update", {
                            screen_name: loadedSpeaker,
                            operation: "add"
                        });
                        speakers.push(loadedSpeaker);
                    });
                    hashtags = JSON.parse(data).hashtags;
                    mentions = JSON.parse(data).mentions;
                    officialUser = JSON.parse(data).officialUser;
                    addTweetUpdate("speaker_update", {
                        screen_name: officialUser,
                        operation: "add"
                    });
                    getUserIDs(function() {
                        callback();
                    });
                } catch (err) {
                    console.log("Error parsing event config file: " + err);
                    callback();
                }
            }
        });
    }

    function addSpeaker(name) {
        addTweetUpdate("speaker_update", {
            screen_name: name,
            operation: "add"
        });
        speakers.push(name);
        writeToFile();
    }

    function removeSpeaker(name) {
        if (speakers.indexOf(name) > -1) {
            addTweetUpdate("speaker_update", {
                screen_name: name,
                operation: "remove"
            });
            speakers.splice(speakers.indexOf(name), 1);
            writeToFile();
        } else {
            console.log("ERROR : Speaker not found in the speakers list");
        }
    }

    function writeToFile() {
        fs.writeFile(eventConfigFile, JSON.stringify({
            "hashtags": hashtags,
            "mentions": mentions,
            "officialUser": officialUser,
            "speakers": speakers
        }), function(err) {
            if (err) {
                console.log("Error writing to event config file" + err);
            }
        });
    }

    function getSpeakers() {
        createStream();
        return speakers;
    }

    function openLogFile(callback) {
        mkdirp(logDir, function(err) {
            // Count a return value of `EEXIST` as successful, as it means the directory already exists
            if (err && err.code !== "EEXIST") {
                throw new Error("Error attempting to create the server log directory: " + logDir);
            }
            logTweetsFile = fs.openSync(logTweetsFilename, "w", null);
            fs.writeSync(logTweetsFile, "[");
            logUpdatesFile = fs.openSync(logUpdatesFilename, "w", null);
            fs.writeSync(logUpdatesFile, "[");
            callback();
        });
    }

    function closeLogFile() {
        fs.writeSync(logTweetsFile, "]");
        fs.closeSync(logTweetsFile);
        fs.writeSync(logUpdatesFile, "]");
        fs.closeSync(logUpdatesFile);
    }

    function logTweets(tweets) {
        fs.writeSync(logTweetsFile, (logTweetsCount === 0 ? "" : ",") + tweets.map(JSON.stringify).join(","));
        logTweetsCount += tweets.length;
    }

    function logUpdates(updates) {
        fs.writeSync(logUpdatesFile, (logUpdatesCount === 0 ? "" : ",") + updates.map(JSON.stringify).join(","));
        logUpdatesCount += updates.length;
    }

    function createStream() {
        var words = getTrackedWords();
        var users = getTrackedUsers();
        stream = client.stream("statuses/filter", {
            track: words,
            follow: users
        });
        stream.on("data", function(event) {
            if (event.user) {
                console.log(event);
            }
        });
        stream.on("error", function(error) {
            console.log(error);
        });
    }

    function getTrackedWords() {
        var query = hashtags.map(function(hash) {
            if (hash.charAt(0) === "#") {
                return hash.substr(1);
            }
            return hash;
        }).join(", ");
        return query;
    }

    function getTrackedUsers() {
        var all = userIDs;
        var query = all.join(", ");
        return query;
    }

    function getUserIDs(done) {
        var all = speakers.concat(mentions);
        var completed = 0;
        for (var i = 0; i < all.length; i++) {
            var user = all[i];
            getUserID(user, function(err, id) {
                if (!err) {
                    userIDs.push(id);
                }
                completed++;
                if (completed === all.length) {
                    done();
                }
            });
        }
    }

    function getUserID(user, cb) {
        client.get("users/lookup.json", {
            screen_name: user
        }, function(err, result) {
            if (err) {
                cb(err, null);
            } else {
                if (result.length > 0) {
                    cb(err, result[0].id);
                } else {
                    cb("No such twitter user " + username, null);
                }
            }
        });
    }
}
