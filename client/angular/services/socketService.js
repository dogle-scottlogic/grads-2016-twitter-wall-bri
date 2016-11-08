(function() {
    angular
        .module("TwitterWallApp")
        .factory("socketService", socketService)
        .controller("MainController", function($scope, MyData) {
            $scope.MyData = MyData;
        });

    // socketService.$inject = ["angular-websocket"];

    function socketService($websocket) {
        // Open a WebSocket connection
        var dataStream = $websocket("ws://website.com/data");

        var collection = [];

        dataStream.onMessage(function(message) {
            collection.push(JSON.parse(message.data));
        });

        var methods = {
            collection: collection,
            get: function() {
                dataStream.send(JSON.stringify({
                    action: "get"
                }));
            }
        };
        return methods;
    }
})();
