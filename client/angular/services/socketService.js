(function() {
    angular
        .module("TwitterWallApp")
        .factory("socketService", socketService);

    function socketService($websocket, $rootScope) {
        // Open a WebSocket connection
        var dataStream = $websocket("ws://localhost:8080");

        var collection = [];
        dataStream.onMessage(function(message) {
            try {
                console.log(message);
                $rootScope.$emit("tweetAdded", JSON.parse(message.data));
            } catch (e) {
                if (message.data) {
                    console.log(message.data);
                } else {
                    console.log(e);
                }
            }
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
