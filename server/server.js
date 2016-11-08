var express = require("express");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");

module.exports = function(port, tweetSearcher, googleAuthoriser) {
    var app = express();

    var adminSessions = {};

    app.use(express.static("client"));
    app.use(cookieParser());
    app.use(bodyParser.json());

    app.get("/oauth", function(req, res) {
        googleAuthoriser.authorise(req, function(err, token) {
            if (!err) {
                adminSessions[token] = true;
                res.cookie("sessionToken", token);
                res.header("Location", "/#/dash");
                res.sendStatus(302);
            } else {
                if (err.message === "Unauthorised user") {
                    res.header("Location", "/#/dash/unauthorised");
                    res.sendStatus(302);
                } else {
                    console.log("Authoriser error:");
                    console.log(err);
                    res.sendStatus(400);
                }
            }
        });
    });

    app.get("/api/oauth/uri", function(req, res) {
        res.json({
            uri: googleAuthoriser.oAuthUri
        });
    });

    app.use("/admin", function(req, res, next) {
        if (req.cookies.sessionToken) {
            if (adminSessions[req.cookies.sessionToken]) {
                next();
            } else {
                res.sendStatus(401);
            }
        } else {
            res.sendStatus(401);
        }
    });

    app.get("/admin", function(req, res) {
        res.sendStatus(200);
    });

    app.post("/admin/logout", function(req, res) {
        adminSessions[req.cookies.sessionToken] = false;
        res.sendStatus(200);
    });

    app.post("/admin/tweets/delete", function(req, res) {
        try {
            tweetSearcher.setDeletedStatus(req.body.id, req.body.deleted);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.post("/admin/tweets/hide_image", function(req, res) {
        try {
            tweetSearcher.setTweetImageHidden(req.body.id, req.body.deleted);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.get("/admin/blocked", function(req, res) {
        var blockedUsers = tweetSearcher.getBlockedUsers();
        res.json(blockedUsers);
    });

    app.post("/admin/blocked/add", function(req, res) {
        try {
            tweetSearcher.addBlockedUser(req.body.user);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.post("/admin/blocked/display", function(req, res) {
        try {
            tweetSearcher.displayBlockedTweet(req.body.id);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.post("/admin/blocked/remove", function(req, res) {
        try {
            tweetSearcher.removeBlockedUser(req.body.user);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.get("/api/speakers", function(req, res) {
        var speakers = tweetSearcher.getSpeakers();
        res.json(speakers);
    });

    app.post("/admin/speakers/add", function(req, res) {
        try {
            tweetSearcher.addSpeaker(req.body.name);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.post("/admin/speakers/remove", function(req, res) {
        try {
            tweetSearcher.removeSpeaker(req.body.name);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.post("/admin/tweets/pin", function(req, res) {
        try {
            tweetSearcher.setPinnedStatus(req.body.id, req.body.pinned);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.post("/admin/tweets/retweetDisplayStatus", function(req, res) {
        try {
            tweetSearcher.setRetweetDisplayStatus(req.body.status);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.post("/admin/tweets/approvedTweetsOnlyStatus", function(req, res) {
        try {
            tweetSearcher.setApprovalMode(req.body.status);
            res.sendStatus(200);
        } catch (err) {
            res.sendStatus(404);
        }
    });

    app.get("/admin/tweets/approvedTweetsOnlyStatus", function(req, res) {
        var status = tweetSearcher.getApprovalMode();
        res.json(status);
    });

    app.get("/admin/administrators", function(req, res) {
        googleAuthoriser.getAdmins()
            .then(function(admins) {
                res.json(admins);
            })
            .catch(function(reason) {
                res.sendStatus(reason);
            });
    });

    app.put("/admin/administrators", function(req, res) {
        googleAuthoriser.addAdmin(req.body.email)
            .then(function(value) {
                res.sendStatus(200);
            })
            .catch(function(reason) {
                res.sendStatus(reason);
            });
    });

    app.delete("/admin/administrators/:email", function(req, res) {
        googleAuthoriser.removeAdmin(req.params.email)
            .then(function(value) {
                res.sendStatus(200);
            })
            .catch(function(reason) {
                res.sendStatus(reason);
            });
    });

    app.get("/api/tweets", function(req, res) {
        console.log("Get tweets");
        var since = req.query.since ? new Date(req.query.since) : undefined;
        res.json(getTweets(since, 200));
    });

    app.get("/api/interactions", function(req, res) {
        var visibleTweets = req.query.visibleTweets;
        tweetSearcher.updateInteractions(visibleTweets, function(error, interactionUpdates) {
            res.json(interactionUpdates);
        });
    });

    function getTweets(since, includeDeleted) {
        return tweetSearcher.getTweetData(since, includeDeleted);
    }

    return app.listen(port);
};
