(function () {
    angular.module("TwitterWallApp").controller("MainController", MainController);

    MainController.$inject = [
        "$scope",
        "twitterWallDataService",
        "$sce",
        "tweetTextManipulationService",
        "$interval",
    ];

    function MainController($scope, twitterWallDataService, $sce, tweetTextManipulationService, $interval) {
        var vm = this;

        $scope.sortByDate = tweetTextManipulationService.sortByDate;

        $scope.tweets = [];

        activate();

        function activate() {
            pageUpdate();
            $interval(pageUpdate, 5000);
        }

        function pageUpdate() {
            updateTweets();
            twitterWallDataService.getMotd().then(function (motd) {
                $scope.motd = motd;
            });
        }

        function updateTweets() {
            twitterWallDataService.getTweets(vm.latestUpdateTime).then(function (results) {
                if (results.tweets.length > 0) {
                    results.tweets.forEach(function (tweet) {
                        tweet.text = $sce.trustAsHtml(tweetTextManipulationService.updateTweet(tweet));
                    });
                }
                if (results.updates.length > 0) {
                    vm.latestUpdateTime = results.updates[results.updates.length - 1].since;
                    var deletedTweets = {};
                    results.updates.forEach(function(update) {
                        if (update.type === "tweet_status" && update.status.deleted) {
                            deletedTweets[update.id] = update.status.deleted;
                        }
                    });
                    $scope.tweets = $scope.tweets.filter(function(tweet) {
                        return deletedTweets[tweet.id_str] !== true;
                    });
                }
                $scope.tweets = $scope.tweets.concat(results.tweets);
            });
        }
    }
})();
