(function() {
    angular.module("TwitterWallApp").controller("MainController", MainController);

    MainController.$inject = [
        "$scope",
        "$rootScope",
        "twitterWallDataService",
        "$sce",
        "tweetTextManipulationService",
        "columnAssignmentService",
        "tweetInfoService",
        "socketService",
        "$interval",
        "$window",
        "$document",
    ];

    function MainController(
        $scope,
        $rootScope,
        twitterWallDataService,
        $sce,
        tweetTextManipulationService,
        columnAssignmentService,
        tweetInfoService,
        socketService,
        $interval,
        $window,
        $document
    ) {

        $rootScope.$on("tweetAdded", function(event, data) {
            $scope.tweets.push(data);
            AddnewTweet(data, function() {
                redisplayTweets();
            });
        });

        $rootScope.$on("removeTweet", function(event, data) {
            var removed = false;
            for (var i = 0; i < data.length; i++) {
                for (var j = 0; j < $scope.tweets.length; j++) {
                    if ($scope.tweets[j].id_str === data[i]) {
                        $scope.tweets.splice(j, 1);
                        removed = true;
                        columnAssignmentService.clearStore("admin");
                        columnAssignmentService.clearStore("client");
                        break;
                    }
                }
            }
            if (removed) {
                onContentChanged();
                redisplayTweets();
            }
        });

        var vm = this;

        $scope.isMobileClient = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        $scope.displayColumns = [
            [],
            [],
            []
        ];

        //slots per column depends on screen height
        $scope.slotBreakpoints = [100, 400, 600, 800, 1280];

        //defines the space between all tweets on the wall
        var tweetMargin = 12;
        var tweetWidth = 0;
        var maxTweetSlotSize = 2;
        var tweetSlotSizes = [];

        $scope.tweets = [];
        var changedTweets = {};

        vm.updates = [];

        vm.redisplayFlags = {
            content: false,
            size: false,
        };

        var shouldBeDisplayed = function(tweet) {
            return !((tweet.blocked && !tweet.display) || tweet.deleted || tweet.hide_retweet);
        };

        $scope.secondLogo = 0; //1 to display, 0 to hide

        // Ordering function such that newer tweets precede older tweets
        var chronologicalOrdering = function(tweetA, tweetB) {
            return new Date(tweetB.created_at).getTime() - new Date(tweetA.created_at).getTime();
        };

        var pinnedOrdering = function(tweetA, tweetB) {
            return tweetB.pinTime.getTime() - tweetA.pinTime.getTime();
        };

        $scope.screenHeight = $window.innerHeight ||
            $document.documentElement.clientHeight ||
            $document.body.clientHeight;
        $scope.screenWidth = $window.innerWidth ||
            $document.documentElement.clientWidth ||
            $document.body.clientWidth;

        $scope.tweetsizeStyles = "";

        var tweetViews = {
            client: {
                backfill: true,
                showAllImages: false,
                columnDataList: [
                    new columnAssignmentService.ColumnData(getSlotsBasedOnScreenHeight() - 1, function(tweet) {
                        return tweet.pinned === true && shouldBeDisplayed(tweet);
                    }, pinnedOrdering, 1, true),
                    new columnAssignmentService.ColumnData(getSlotsBasedOnScreenHeight(), function(tweet) {
                        return tweet.wallPriority !== true && shouldBeDisplayed(tweet);
                    }, chronologicalOrdering, 0, false),
                    new columnAssignmentService.ColumnData(getSlotsBasedOnScreenHeight() - $scope.secondLogo, function(tweet) {
                        return tweet.wallPriority === true && shouldBeDisplayed(tweet);
                    }, chronologicalOrdering, $scope.secondLogo, false),
                ],
            },
            admin: {
                backfill: false,
                showAllImages: false,
                columnDataList: [
                    new columnAssignmentService.ColumnData(4, function(tweet) {
                        return tweet.pinned === true;
                    }, pinnedOrdering, 1, true),
                    new columnAssignmentService.ColumnData(5, function(tweet) {
                        return tweet.wallPriority !== true;
                    }, chronologicalOrdering, 0, false),
                    new columnAssignmentService.ColumnData(5 - $scope.secondLogo, function(tweet) {
                        return tweet.wallPriority === true;
                    }, chronologicalOrdering, $scope.secondLogo, false),
                ],
            },
        };

        $scope.adminViewEnabled = adminViewEnabled;
        $scope.showTweetImage = showTweetImage;

        activate();

        function activate() {
            // Set up listeners
            angular.element($window).on("resize", onSizeChanged);
            var adminViewWatcher = $scope.$watch(adminViewEnabled, onContentChanged);
            $scope.$on("$destroy", function() {
                angular.element($window).off("resize", onSizeChanged);
                adminViewWatcher();
            });
            // Begin update loop
            updateTweets(function() {
                redisplayTweets();
            });
            if (!$scope.loggedIn) {
                updateInteractions();
            }
        }

        function showTweetImage(tweet) {
            return tweetInfoService.tweetHasImage(tweet, adminViewEnabled());
        }

        function adminViewEnabled() {
            return $scope.adminView || false;
        }

        function getCurrentTweetView() {
            return adminViewEnabled() ? "admin" : "client";
        }

        function onSizeChanged() {
            vm.redisplayFlags.size = true;
        }

        function onContentChanged() {
            vm.redisplayFlags.content = true;
        }

        // Calls the necessary functions to redisplay tweets if any relevant data has changed
        // Called very frequently, but does nothing if no such data changes have occurred - the reason this is done
        // instead of just calling immediately when something changes is to prevent massive spam from window resize
        // events
        function redisplayTweets() {
            if (vm.redisplayFlags.content) {
                vm.redisplayFlags.size = true;
                displayTweets($scope.tweets);
            }
            if (vm.redisplayFlags.size) {
                if ($scope.isMobile) {
                    calcTweetSlotCounts([$scope.tweets], [{
                        slots: 4,
                        extraContentSpacing: 0
                    }]);
                    calcTweetDimensions([{
                        slots: 4,
                        extraContentSpacing: 0
                    }]);
                    calcLogoDimensions([{
                        slots: 4,
                        extraContentSpacing: 0
                    }]);
                } else {
                    $scope.screenHeight = $window.innerHeight ||
                        $document.documentElement.clientHeight ||
                        $document.body.clientHeight;
                    $scope.screenWidth = $window.innerWidth ||
                        $document.documentElement.clientWidth ||
                        $document.body.clientWidth;

                    //adapt the number of tweets per column to fit screen size
                    tweetViews[getCurrentTweetView()].columnDataList.forEach(function(columnData, idx) {
                        columnData.slots = getSlotsBasedOnScreenHeight();
                        if (idx === 0) {
                            columnData.slots -= 1;
                        }
                    });

                    calcTweetSlotCounts($scope.displayColumns, tweetViews[getCurrentTweetView()].columnDataList);
                    calcTweetDimensions(tweetViews[getCurrentTweetView()].columnDataList);
                    calcLogoDimensions(tweetViews[getCurrentTweetView()].columnDataList);
                }
                calcTweetSizeStyles();
            }
            Object.keys(vm.redisplayFlags).forEach(function(key) {
                vm.redisplayFlags[key] = false;
            });
        }

        function AddnewTweet(tweet, done) {
            tweet.displayText = $sce.trustAsHtml(tweetTextManipulationService.getDisplayText(tweet));
            changedTweets[tweet.id_str] = tweet;
            onContentChanged();
            done();
        }

        function updateTweets(done) {
            // Gets the list of tweets from the server
            twitterWallDataService.getTweets(function(results) {
                var newTweets = [];
                if (results.tweets.length > 0) {
                    results.tweets.forEach(function(tweet) {
                        tweet.displayText = $sce.trustAsHtml(tweetTextManipulationService.getDisplayText(tweet));
                    });
                    newTweets = $scope.setFlagsForTweets(results.tweets, vm.updates);
                }
                $scope.tweets = newTweets;
                newTweets.forEach(function(newTweet) {
                    changedTweets[newTweet.id_str] = newTweet;
                });
                $scope.tweets = $scope.setFlagsForTweets($scope.tweets, results.updates);
                //vm.updates = vm.updates.concat(results.updates);
                onContentChanged();
                done();
            });
        }

        var logoBoxWidth;
        var logoBoxHeight;

        function calcTweetSlotCounts(displayColumns, columnDataList) {
            displayColumns.forEach(function(tweetColumn, colIdx) {
                tweetColumn.forEach(function(tweet) {
                    tweet.slotCount = showTweetImage(tweet) ? 2 : 1;
                });
            });
        }

        function calcLogoDimensions(columnDataList) {
            var baseColumnWidth = getTweetWidth($scope.screenWidth, columnDataList);
            logoBoxWidth = baseColumnWidth;
            logoBoxHeight = getTweetHeight($scope.screenHeight, {
                slots: getSlotsBasedOnScreenHeight(),
                extraContentSpacing: 0
            });
            if ($scope.isMobileClient) {
                logoBoxWidth = $scope.screenWidth - 2 * tweetMargin;
                logoBoxHeight = logoBoxWidth / 3;
            }
        }

        function calcTweetDimensions(columnDataList) {
            tweetWidth = getTweetWidth($scope.screenWidth, columnDataList);
            tweetSlotSizes = [];
            columnDataList.forEach(function(columnData, idx) {
                tweetSlotSizes.push([]);
                var baseSlotHeight = getTweetHeight($scope.screenHeight, columnData);
                for (var slotSize = 1; slotSize <= maxTweetSlotSize; slotSize++) {
                    tweetSlotSizes[idx].push((baseSlotHeight * slotSize) + (tweetMargin * 2 * (slotSize - 1)));
                }
            });
        }

        function getTweetWidth(width, columnDataList) {
            var tweetWidth = (width - //total screen width
                    (2 * tweetMargin * columnDataList.length)) / //remove total size of margins between columns
                columnDataList.length; //divide remaining space between columns;
            if ($scope.isMobileClient) {
                tweetWidth = $scope.screenWidth - 2 * tweetMargin;
            }
            return tweetWidth;
        }

        function getTweetHeight(height, columnData) {
            return ((height - //the total screen height
                    (2 * tweetMargin * columnData.slots) - //remove total size of margins between tweets
                    (2 * tweetMargin * columnData.extraContentSpacing)) / //remove any space taken up by extra content
                (columnData.slots + columnData.extraContentSpacing)); //divide the remaining available space between slots
        }

        function getSlotsBasedOnScreenHeight() {
            var slots;
            var idx = 0;

            while (!slots) {
                if (idx === $scope.slotBreakpoints.length) {
                    slots = idx + 1;
                }
                if ($scope.screenHeight < $scope.slotBreakpoints[idx]) {
                    slots = idx + 1;

                }
                idx++;
            }
            return slots;
        }

        $scope.getLogoBoxDimensions = function() {
            return {
                "margin": tweetMargin + "px",
                "width": logoBoxWidth + "px",
                "height": logoBoxHeight + "px"
            };
        };

        $scope.getLogoDimensions = function() {
            return {
                "width": logoBoxHeight + "px",
                "height": logoBoxHeight + "px",
            };
        };

        $scope.getMessageBoxDimensions = function() {
            var width = logoBoxWidth - logoBoxHeight;
            var font = Math.floor(logoBoxHeight / 4);
            return {
                "width": width + "px",
                "height": logoBoxHeight + "px",
                "font-size": font + "px"
            };
        };

        function updateInteractions() {
            var visibleTweets = [];
            $scope.displayColumns.forEach(function(column) {
                column.forEach(function(tweet) {
                    visibleTweets.push({
                        id_str: tweet.id_str,
                        favorite_count: tweet.favorite_count,
                        retweet_count: tweet.retweet_count
                    });
                });
            });
            // twitterWallDataService.updateInteractions(JSON.stringify(visibleTweets)).then(function(results) {
            //     if (results) {
            //         results.favourites.forEach(function(favouriteUpdate) {
            //             var updatedTweet = $scope.tweets.find(function(tweet) {
            //                 return tweet.id_str === favouriteUpdate.id;
            //             });
            //             updatedTweet.favorite_count = favouriteUpdate.value;
            //         });
            //         results.retweets.forEach(function(retweetUpdate) {
            //             var updatedTweet = $scope.tweets.find(function(tweet) {
            //                 return tweet.id_str === retweetUpdate.id;
            //             });
            //             updatedTweet.retweet_count = retweetUpdate.value;
            //         });
            //     }
            // });
        }

        function displayTweets(tweets) {
            var displayColumns;
            var changedTweetsArr = Object.keys(changedTweets).map(function(key) {
                return changedTweets[key];
            });
            var clientDisplayColumns;
            // changedTweets = {};
            for (var tweetViewName in tweetViews) {
                var tweetView = tweetViews[tweetViewName];
                var viewDisplayColumns = columnAssignmentService.assignDisplayColumns(
                    tweets, tweetView.columnDataList, tweetView.backfill, tweetView.showAllImages, tweetViewName
                );
                if (tweetViewName === getCurrentTweetView()) {
                    displayColumns = viewDisplayColumns;
                }
                if (tweetViewName === "client") {
                    clientDisplayColumns = viewDisplayColumns;
                }
            }
            $scope.displayColumns = displayColumns;
            $scope.onscreenTweets = (clientDisplayColumns.reduce(function(prevColumn, curColumn) {
                return prevColumn.concat(curColumn);
            }));
        }

        $scope.setFlagsForTweets = function(tweets, updates) {
            updates.forEach(function(update) {
                if (update.type === "tweet_status") {
                    var updatedTweet = tweets.find(function(tweet) {
                        return tweet.id_str === update.id;
                    });
                    if (updatedTweet) {
                        for (var prop in update.status) {
                            updatedTweet[prop] = update.status[prop];
                        }
                        if (update.status.pinned) {
                            updatedTweet.pinTime = new Date(update.since);
                        }
                        changedTweets[updatedTweet.id_str] = updatedTweet;
                    }
                } else if (update.type === "user_block") {
                    tweets.forEach(function(tweet) {
                        if (tweet.user.screen_name === update.screen_name) {
                            tweet.blocked = update.blocked;
                            changedTweets[tweet.id_str] = tweet;
                        }
                    });
                } else if (update.type === "speaker_update") {
                    var wallPriority;
                    if (update.operation === "add") {
                        wallPriority = true;
                    } else if (update.operation === "remove") {
                        wallPriority = false;
                    }
                    tweets.forEach(function(tweet) {
                        if (tweet.user.screen_name === update.screen_name) {
                            tweet.wallPriority = wallPriority;
                            changedTweets[tweet.id_str] = tweet;
                        }
                        return tweet;
                    });
                } else if (update.type === "retweet_display") {
                    tweets.forEach(function(tweet) {
                        var initialHiddenStatus = tweet.hide_retweet;
                        switch (update.status) {
                            case "all":
                                tweet.hide_retweet = false;
                                break;
                            case "bristech_only":
                                tweet.hide_retweet = (tweet.retweeted_status && (tweet.user.screen_name !== "bristech")) ? true : false;
                                break;
                            case "none":
                                tweet.hide_retweet = tweet.retweeted_status ? true : false;
                                break;
                            default:
                                tweet.hide_retweet = false;
                                break;
                        }
                        if (tweet.hide_retweet !== initialHiddenStatus) {
                            changedTweets[tweet.id_str] = tweet;
                        }
                    });
                }
            });
            return tweets;
        };

        function calcTweetSizeStyles() {
            var tweetStyles = [];
            tweetSlotSizes.forEach(function(columnSlotSizes, columnIdx) {
                columnSlotSizes.forEach(function(slotSize, slotIdx) {
                    var tweetClass = "tweet-" + columnIdx + "-" + (slotIdx + 1);
                    var tweetStyle = "." + tweetClass + " {\n" +
                        "height: " + slotSize + "px;\n" +
                        "width: " + tweetWidth + "px;\n" +
                        "margin-top: " + tweetMargin + "px;\n" +
                        "margin-bottom: " + tweetMargin + "px;\n" +
                        "margin-left: " + tweetMargin + "px;\n" +
                        "margin-right: " + tweetMargin + "px;\n" +
                        "}";
                    var outAnimStyle = "." + tweetClass + ".ng-enter,\n" +
                        "." + tweetClass + ".ng-leave.ng-leave-active {\n" +
                        "transition: 1.5s ease all;\n" +
                        "max-height: 0;\n" +
                        "margin-top: 0;\n" +
                        "margin-bottom: 0;\n" +
                        "transform: rotateX(90deg);\n" +
                        "}";
                    var inAnimStyle = "." + tweetClass + ".ng-leave,\n" +
                        "." + tweetClass + ".ng-enter.ng-enter-active {\n" +
                        "transition: 1.5s ease all;\n" +
                        "max-height: " + slotSize + "px;\n" +
                        "margin-top: " + tweetMargin + "px;\n" +
                        "margin-bottom: " + tweetMargin + "px;\n" +
                        "transform: rotateX(0deg);\n" +
                        "}";
                    tweetStyles.push(tweetStyle);
                    tweetStyles.push(outAnimStyle);
                    tweetStyles.push(inAnimStyle);
                });
            });
            $scope.tweetsizeStyles = tweetStyles.join("\n");
        }

        $scope.getMobileTweetWidth = function(tweet) {
            return {
                "width": tweetWidth + "px",
            };
        };

        $scope.verySmallScreen = function() {
            return ($scope.screenWidth < 600);
        };

        $scope.setAdminButtonSize = function() {
            if ($scope.verySmallScreen()) {
                return {
                    "margin": 0 + "px"
                };
            }
        };

        if (!Array.prototype.find) {
            Array.prototype.find = function(predicate) {
                "use strict";
                if (this === null) {
                    throw new TypeError("Array.prototype.find called on null or undefined");
                }
                if (typeof predicate !== "function") {
                    throw new TypeError("predicate must be a function");
                }
                var list = Object(this);
                var length = list.length >>> 0;
                var thisArg = arguments[1];
                var value;

                for (var i = 0; i < length; i++) {
                    value = list[i];
                    if (predicate.call(thisArg, value, i, list)) {
                        return value;
                    }
                }
                return undefined;
            };
        }
    }
})();
