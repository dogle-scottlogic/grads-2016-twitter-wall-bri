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
    }

    function setApprovalMode(approveTweets) {
        inApprovalMode = approveTweets;
    }

    function getApprovalMode() {
        return {
            status: inApprovalMode
        };
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

    var searchUpdater;
    var userUpdater;

    function readTextFile(file, callback) {
        fs.readFile(file, "utf8", function(err, data) {
            if (err) {
                console.log("Error reading config file: " + err);
            } else {
                try {
                    var json = JSON.parse(data);
                    hashtags = json.hashtags;
                    mentions = json.mentions;
                    officialUser = json.officialUser;
                    speakers = json.speakers;
                } catch (err) {
                    console.log("Error reading config file: " + err);
                }
            }
            callback();
        });
    }

    // load all tracked items
    readTextFile(eventConfigFile, function() {
        // do initial REST API call
        getInitialTweets();
        // setup stream
        createStream();
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
        setApprovalMode: setApprovalMode,
        getApprovalMode: getApprovalMode,
    };

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

    function loadTweets(tweets, type) {
        addTweetItem(tweets, type);
    }

    function getTweetStore() {
        return tweetStore;
    }

    function getTweetData() {
        return {
            tweets: tweetStore,
            updates: []
        };
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
        return speakers;
    }

    function getInitialTweets() {
        tweetStore = [];
        getAllUserTweets();
        getAllHashTweets();
    }

    function getAllUserTweets() {
        var all = speakers.concat(mentions);
        all.forEach(function(user) {
            getUserTweets(user, 10, function(tweets) {
                tweetStore = tweetStore.concat(tweets);
            });
        });
    }

    function getUserTweets(user, limit, done) {
        client.get("statuses/user_timeline", {
            screen_name: user,
            exclude_replies: true,
            count: limit,
            tweet_mode: "extended"
        }, function(err, result) {
            done(result);
        });
    }

    function getAllHashTweets() {
        var query = hashtags.join(" OR ");
        getHashTweets(query, 30, function(tweets) {
            tweetStore = tweetStore.concat(tweets.statuses);
        });
    }

    function getHashTweets(query, limit, done) {
        client.get("search/tweets", {
            q: query,
            result_type: "recent",
            count: limit,
            tweet_mode: "extended"
        }, function(err, result) {
            done(result);
        });
    }

    function createStream() {
        getUserIDs(function() {
            var words = getTrackedWords();
            var users = getTrackedUsers();
            stream = client.stream("statuses/filter", {
                track: words,
                follow: users
            });
            stream.on("data", function(event) {
                if (event.user) {
                    tweetReceived(event);
                }
            });
            stream.on("error", function(error) {
                console.log(error);
            });
        });
    }

    function tweetReceived(tweet) {
        // send to client
        console.log(tweet.user.screen_name);
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
