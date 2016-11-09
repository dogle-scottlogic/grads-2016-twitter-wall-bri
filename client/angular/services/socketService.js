(function() {
    angular
        .module("TwitterWallApp")
        .factory("socketService", socketService);

    function socketService($websocket, $rootScope) {
        // Open a WebSocket connection
        var dataStream = $websocket("ws://localhost:8080");

        var collection = [];
        dataStream.onMessage(function(incoming_package) {
            try {
                incoming_package = JSON.parse(incoming_package.data);
                var type = incoming_package.type;
                var message = incoming_package.message;
                switch (type) {
                    case "tweet":
                        $rootScope.$emit("tweetAdded", message);
                        break;
                    case "remove":
                        $rootScope.$emit("removeTweet", message);
                        break;
                    case "update":
                        $rootScope.$emit("updateTweet", message);
                        break;
                    case "reload":
                        $rootScope.$emit("reload");
                    default:
                        console.log("no type found");
                }
            } catch (e) {
                if (incoming_package.data) {
                    console.log(incoming_package.data);
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
