(function() {
    angular
        .module("TwitterWallApp")
        .factory("twitterWallDataService", twitterWallDataService);

    twitterWallDataService.$inject = ["$http"];

    function twitterWallDataService($http) {
        return {
            getTweets: getTweets
        };

        function getTweets(done) {
            var query = {};
            return $http.get("/api/tweets", {
                params: query
            }).then(function(result) {
                done(result.data);
            });
        }
    }

})();
