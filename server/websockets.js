var WebSocketServer = require('ws').Server
var http = require("http");

var ws = null;

var init = function(app) {
    var server = http.createServer(app);
    var wss = new WebSocketServer({
        server: server
    });

    wss.broadcast = function broadcast(data) {
        wss.clients.forEach(function each(client) {
            client.send(data, function(error) {
                if (error) {
                    console.log(error);
                }
            });
        });
    };

    wss.on('connection', function connection(webs) {
        webs.on('message', function incoming(message) {
            console.log('received: %s', message);
        });

        webs.on('close', function close() {
            console.log('disconnected');
        });
        webs.on("error", function(err) {
            console.log("error " + err);
        })
        webs.send("connected");
        console.log("connected");
    });
    ws = wss;
    return server;
};

var emit = function(message) {
    console.log("sending message " + message);
    ws.broadcast(message);
}

module.exports = {
    init: init,
    emit: emit
};
