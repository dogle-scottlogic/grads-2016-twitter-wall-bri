(function() {
    angular
        .module("TwitterWallApp")
        .factory("adminDashDataService", adminDashDataService);

    adminDashDataService.$inject = ["$http"];

    function adminDashDataService($http) {
        return {
            authenticate: authenticate,
            logOut: logOut,
            getAuthUri: getAuthUri,
            setDeletedStatus: setDeletedStatus,
            blockedUsers: blockedUsers,
            addBlockedUser: addBlockedUser,
            removeBlockedUser: removeBlockedUser,
            getSpeakers: getSpeakers,
            addSpeaker: addSpeaker,
            removeSpeaker: removeSpeaker,
            setPinnedStatus: setPinnedStatus,
            displayBlockedTweet: displayBlockedTweet,
            setRetweetDisplayStatus: setRetweetDisplayStatus,
            setPictureDeletedStatus: setPictureDeletedStatus,
            getAdmins: getAdmins,
            addAdmin: addAdmin,
            setLimit: setLimit,
            removeAdmin: removeAdmin,
            setApprovedTweetsOnlyStatus: setApprovedTweetsOnlyStatus,
            getApprovedTweetsOnlyStatus: getApprovedTweetsOnlyStatus
        };

        function setPictureDeletedStatus(id, deleted) {
            return $http.post("/admin/tweets/hide_image", {
                id: id,
                deleted: deleted,
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function setLimit(limit) {
            return $http.post("/admin/limit", {
                limit: limit
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function displayBlockedTweet(id) {
            return $http.post("/admin/blocked/display", {
                id: id
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function blockedUsers() {
            return $http.get("/admin/blocked").then(function(result) {
                return result.data;
            });
        }

        function removeBlockedUser(user) {
            return $http.post("/admin/blocked/remove", {
                user: user
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function addBlockedUser(name, screen_name) {
            return $http.post("/admin/blocked/add", {
                user: {
                    name: name,
                    screen_name: screen_name
                }
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function authenticate() {
            return $http.get("/admin");
        }

        function logOut() {
            return $http.post("/admin/logout");
        }

        function getAuthUri() {
            return $http.get("/api/oauth/uri").then(function(result) {
                return result.data.uri;
            });
        }

        function setDeletedStatus(id, deleted) {
            return $http.post("/admin/tweets/delete", {
                id: id,
                deleted: deleted,
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function getSpeakers() {
            return $http.get("/api/speakers").then(function(result) {
                return result.data;
            });
        }

        function addSpeaker(name) {
            return $http.post("/admin/speakers/add", {
                name: name,
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function removeSpeaker(name) {
            return $http.post("/admin/speakers/remove", {
                name: name,
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function getAdmins(email) {
            return $http.get("/admin/administrators").then(function(result) {
                return result.data;
            });
        }

        function addAdmin(email) {
            return $http.put("/admin/administrators", {
                email: email,
            }, {
                headers: {
                    "Content-type": "application/json"
                }
            });
        }

        function removeAdmin(email) {
            return $http.delete("/admin/administrators/" + email);
        }

        function setPinnedStatus(id, pinned) {
            return $http.post("/admin/tweets/pin", {
                id: id,
                pinned: pinned
            });
        }

        function setRetweetDisplayStatus(status) {
            return $http.post("/admin/tweets/retweetDisplayStatus", {
                status: status
            });
        }

        function setApprovedTweetsOnlyStatus(status) {
            return $http.post("/admin/tweets/approvedTweetsOnlyStatus", {
                status: status
            });
        }

        function getApprovedTweetsOnlyStatus() {
            return $http.get("/admin/tweets/approvedTweetsOnlyStatus").then(function(result) {
                return result.data;
            });
        }
    }
})();
