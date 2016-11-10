var socket = require("./websockets");

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
    var limit = 50;
    var retweet_status = "all";

    var stream;

    function addTweetItem(tweets, tag) {
        if (tweets.length === 0) {
            return;
        }
        tweetStore = tweetStore.concat(tweets);
        if (inApprovalMode) {
            tweets.forEach(function(tweet) {
                setDeletedStatus(tweet.id_str, true);
            });
        }
    }

    function getLimit() {
        return limit;
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

    function getTweet(id) {
        var tweet = findLast(tweetStore, function(twt) {
            return twt.id_str === id;
        });
        if (!tweet) {
            throw new Error("Cannot modify tweet that the server does not have.");
        }
        return tweet;
    }

    function setDeletedStatus(ids, deleted) {
        var updated = [];
        ids.forEach(function(id) {
            var tweet = getTweet(id);
            tweet.deleted = deleted;
            updated.push(tweet);
        });
        socket.emit(updated, "update");
    }

    function setPinnedStatus(tweetId, pinned) {
        var tweet = getTweet(tweetId);
        tweet.pinned = pinned;
        socket.emit([tweet], "update");
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
        tweetSetup(function() {});
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
        setLimit: setLimit,
        getLimit: getLimit
    };

    function getBlockedUsers() {
        return blockedUsers;
    }

    function addBlockedUser(user) {
        if (!blockedUsers.find(function(blockedUser) {
                return blockedUser.screen_name === user.screen_name;
            })) {
            blockedUsers.push(user);
            removeBlockedUserTweets(user);
        } else {
            console.log("User " + user.screen_name + " already blocked");
        }
    }

    function removeBlockedUserTweets(user) {
        var removed = [];
        for (var i = tweetStore.length - 1; i >= 0; i--) {
            var tweet = tweetStore[i];
            if (tweet.user.screen_name === user.screen_name) {
                removed.push(tweet.id_str);
                tweetStore.splice(i, 1);
            }
        }
        if (removed.length > 0) {
            socket.emit(removed, "remove");
        }
    }

    function removeBlockedUser(user) {
        if (!blockedUsers.find(function(blockedUser) {
                return blockedUser.screen_name === user.screen_name;
            })) {
            return;
        }
        blockedUsers = blockedUsers.filter(function(usr) {
            return usr.screen_name !== user.screen_name;
        });
    }

    function displayBlockedTweet(tweetId) {
        var tweet = getTweet(tweetId);
        tweet.display = true;
        socket.emit([tweet], "update");
    }

    function setRetweetDisplayStatus(status) {
        retweet_status = status;
        switch (status) {
            case "all":
                setDeletedStatus(getRetweetIds(tweetStore), false);
                break;
            case "none":
                setDeletedStatus(getRetweetIds(tweetStore), true);
                break;
            case "bristech_only":
                setDeletedStatus(getRetweetIds(tweetStore, "bristech"), true);
                break;
            default:
                console.log("not a valid status");
        }
    }

    function setTweetImageHidden(tweetId, hidden) {
        var tweet = getTweet(tweetId);
        tweet.hide_image = hidden;
        socket.emit([tweet], "update");
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
        speakers.push(name);
        writeToFile();
        tweetSetup(function() {
            socket.clientReload();
        });
    }

    function removeSpeaker(name) {
        if (speakers.indexOf(name) > -1) {
            speakers.splice(speakers.indexOf(name), 1);
            writeToFile();
            tweetSetup(function() {
                socket.clientReload();
            });
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

    function getInitialTweets(cb) {
        tweetStore = [];
        var doneCount = 0;
        getAllUserTweets(function() {
            doneCount++;
            if (doneCount === 2) {
                return cb();
            }
        });
        getAllHashTweets(function() {
            doneCount++;
            if (doneCount === 2) {
                return cb();
            }
        });
    }

    function getRetweetIds(tweets, filter) {
        var retweetIds = [];
        tweets.forEach(function(tweet) {
            if ((!filter && tweet.retweeted_status) || (filter && tweet.retweeted_status && tweet.user.screen_name !== filter)) {
                retweetIds.push(tweet.id_str);
            }
        });
        return retweetIds;
    }

    function getAllUserTweets(cb) {
        var all = speakers.concat(mentions);
        var doneCount = 0;
        all.forEach(function(user) {
            getUserTweets(user, 5, function(tweets) {
                tweets.forEach(function(tweet) {
                    tweet.wallPriority = true;
                });
                tweetStore = tweetStore.concat(tweets);
                doneCount++;
                if (doneCount === all.length) {
                    cb();
                }
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

    function getAllHashTweets(cb) {
        var query = hashtags.join(" OR ");
        getHashTweets(query, 30, function(tweets) {
            tweetStore = tweetStore.concat(tweets.statuses);
            cb();
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
                console.log("Streaming error:\n\t" + error);
            });
            stream.on("end", function() {
                console.log("Stream ended");
            });
        });
    }

    function tracking(tweet) {
        if (!tweet) {
            return false;
        }
        var userTweet = mentions.some(function(user) {
            return user === tweet.user.screen_name;
        });
        var speakerTweet = speakers.some(function(user) {
            return user === tweet.user.screen_name;
        });
        var hashTweet = hashtags.some(function(hashtag) {
            var tags = tweet.entities.hashtags;
            var hash = hashtag.charAt(0) === "#" ? hashtag.slice(1) : hashtag;
            return tags.some(function(tag) {
                return tag.text.toUpperCase() === hash.toUpperCase();
            });
        });
        if (userTweet || speakerTweet || hashTweet) {
            return true;
        }
        return false;
    }

    function newTweet(tweet) {
        var index = -1;
        if (tweet.retweeted_status) {
            var reTweet = tweet.retweeted_status;
            for (var i = 0; i < tweetStore.length; i++) {
                var twt = tweetStore[i];
                if (reTweet.id_str === twt.id_str) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                tweetStore[index] = reTweet;
                return false;
            }
        }
        return true;
    }

    function setFullText(tweet) {
        if (tweet.truncated && tweet.extended_tweet !== undefined) {
            tweet.full_text = tweet.extended_tweet.full_text;
        } else {
            tweet.full_text = tweet.text;
        }
        return tweet;
    }

    function tweetReceived(tweet) {
        // send to client
        var valid = blockedUsers.every(function(user) {
            return user !== tweet.user.screen_name;
        });
        if (tweet !== undefined && valid) {
            tweet = setFullText(tweet);
            if (tracking(tweet)) {
                if (newTweet(tweet)) {
                    if (tweetStore.length >= limit) {
                        var removedTweet = tweetStore.shift();
                        socket.emit([removedTweet.id_str], "remove");
                    }
                    checkRetweet(tweet);
                    checkApproved(tweet);
                    tweetStore.push(tweet);
                    socket.emit(tweet, "tweet");
                } else {
                    socket.emit([tweet], "update");
                }
            } else if (tracking(tweet.retweeted_status)) {
                if (!newTweet(tweet)) {
                    tweet.retweeted_status = setFullText(tweet.retweeted_status);
                    socket.emit([tweet.retweeted_status], "update");
                }
            }
        }
    }

    function checkApproved(tweet) {
        if (inApprovalMode) {
            tweet.deleted = true;
        }
    }

    function checkRetweet(tweet) {
        if (retweet_status === "none" && tweet.retweeted_status) {
            tweet.deleted = true;
            return;
        }
        if (retweet_status === "bristech_only" && tweet.retweeted_status && tweet.user.screen_name !== "bristech") {
            tweet.deleted = true;
            return;
        }
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
        userIDs = [];
        var all = speakers.concat(mentions);
        var completed = 0;
        var userPush = function(err, id) {
            if (!err) {
                userIDs.push(id);
            }
            completed++;
            if (completed === all.length) {
                done();
            }
        };
        for (var i = 0; i < all.length; i++) {
            var user = all[i];
            getUserID(user, userPush);
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
                    cb("No such twitter user " + user, null);
                }
            }
        });
    }

    function sortTweets() {
        var parseTwitterDate = function(text) {
            return new Date(Date.parse(text.replace(/( +)/, " UTC$1")));
        };
        var mills = Date.parse(parseTwitterDate(tweetStore[0].created_at));
        var sort = function(a, b) {
            var aMills = Date.parse(parseTwitterDate(a.created_at));
            var bMills = Date.parse(parseTwitterDate(b.created_at));
            return aMills - bMills;
        };
        tweetStore.sort(sort);

        while (tweetStore.length > limit) {
            tweetStore.shift();
        }
    }

    function tweetSetup(cb) {
        if (stream) {
            stream.destroy();
        }
        getInitialTweets(function() {
            sortTweets();
            validateTweets();
            createStream();
            cb();
        });
    }

    function validateTweets() {
        var userCompare = function(user) {
            return user === tweet.user.screen_name;
        };
        for (var i = tweetStore.length; i >= 0; i--) {
            var tweet = tweetStore[i];
            var blocked = blockedUsers.some(userCompare);
            if (blocked) {
                tweetStore.splice(i, 1);
            }
        }
    }

    function setLimit(num) {
        if (num > limit) {
            limit = num;
            getInitialTweets(function() {
                sortTweets();
                validateTweets();
                socket.clientReload();
            });
        } else {
            limit = num;
            var removed = [];
            while (tweetStore.length > limit) {
                var removedTweet = tweetStore.shift();
                removed.push(removedTweet.id_str);
            }
            if (removed.length > 0) {
                socket.emit(removed, "remove");
            }
        }
    }
};
