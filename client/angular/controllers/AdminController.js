(function() {

    angular.module("TwitterWallApp").controller("AdminController", AdminController);

    AdminController.$inject = [
        "$scope",
        "adminDashDataService",
        "$sce",
        "$routeParams",
        "$interval",
        "$timeout"
    ];

    function AdminController(
        $scope, adminDashDataService, $sce, $routeParams, $interval, $timeout
    ) {
        var vm = this;
        $scope.speakers = [];
        $scope.loggedIn = false;
        $scope.adminView = false;
        $scope.ctrl = {};
        $scope.errorMessage = "In order to access the dash board for this Twitter Wall you must be authorised";
        $scope.blockedUsers = [];
        $scope.admins = [];
        $scope.totalTweets = 50;
        var setTotalTweetsTimeout;

        $scope.updateTotalTweets = function(totalTweets) {
            $scope.totalTweets = totalTweets;
            if (setTotalTweetsTimeout) $timeout.cancel(setTotalTweetsTimeout);
            setTotalTweetsTimeout = $timeout(function() {
                adminDashDataService.setLimit($scope.totalTweets);
            }, 3000);
        };

        var limit = [9, 10, 10];
        $scope.getLimit = function(index) {
            return limit[index];
        };

        $scope.increaseLimit = function(index) {
            limit[index] += 5;
        };

        $scope.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        $scope.ctrl.swiped = {};
        $scope.onTweetSwiped = function(tweet, showDelete) {
            $scope.ctrl.swiped[tweet.id_str] = showDelete;
        };

        $scope.setPictureDeletedStatus = adminDashDataService.setPictureDeletedStatus;

        $scope.setDeletedStatus = function(id, deleted) {
            adminDashDataService.setDeletedStatus(id, deleted);
            $scope.ctrl.swiped[id] = false;
        };
        $scope.setPinnedStatus = adminDashDataService.setPinnedStatus;

        $scope.addSpeaker = addSpeaker;
        $scope.removeSpeaker = removeSpeaker;

        $scope.addAdmin = addAdmin;
        $scope.removeAdmin = removeAdmin;

        $scope.displayBlockedTweet = adminDashDataService.displayBlockedTweet;

        $scope.setRetweetDisplayStatus = adminDashDataService.setRetweetDisplayStatus;

        $scope.setApprovedTweetsOnlyStatus = adminDashDataService.setApprovedTweetsOnlyStatus;

        $scope.getBlockedUsers = function() {
            adminDashDataService.blockedUsers().then(function(users) {
                $scope.blockedUsers = users;
            });
        };

        $scope.removeBlockedUser = function(user) {
            adminDashDataService.removeBlockedUser(user).then(function(result) {
                adminDashDataService.blockedUsers().then(function(users) {
                    $scope.blockedUsers = users;
                });
            });
        };

        $scope.addBlockedUser = function(name, screen_name) {
            adminDashDataService.addBlockedUser(name, screen_name).then(function(result) {
                adminDashDataService.blockedUsers().then(function(users) {
                    $scope.blockedUsers = users;
                });
            });
        };

        $scope.toggleBlocked = function(name, screen_name, blocked) {
            if (blocked) {
                var user = {
                    name: name,
                    screen_name: screen_name
                };
                $scope.removeBlockedUser(user);
            } else {
                $scope.addBlockedUser(name, screen_name);
            }
        };

        $scope.logOut = function() {
            adminDashDataService.logOut().then(function() {
                adminDashDataService.getAuthUri().then(function(uri) {
                    $scope.loginUri = uri;
                    $scope.loggedIn = false;
                });
            });
        };

        activate();

        function activate() {
            adminDashDataService.authenticate().then(function() {
                adminDashDataService.getSpeakers().then(function(speakers) {
                    $scope.speakers = speakers;
                }).catch(function(err) {
                    console.log("Could not get list of speakers:" + err);
                });
                adminDashDataService.getAdmins().then(function(admins) {
                    $scope.admins = admins;
                }).catch(function(err) {
                    console.log("Could not get list of admins:" + err);
                });
                $scope.loggedIn = true;
                $scope.adminView = true;
                getApprovedTweetsOnlyStatus();
                $interval(getApprovedTweetsOnlyStatus, 500);
            }).catch(function() {
                adminDashDataService.getAuthUri().then(function(uri) {
                    if ($routeParams.status === "unauthorised") {
                        $scope.errorMessage = "This account is not authorised, please log in with an authorised account";
                    }
                    $scope.loginUri = uri;
                });
            });
        }

        function addSpeaker() {
            adminDashDataService.addSpeaker($scope.ctrl.speaker).then(function(result) {
                $scope.ctrl.speaker = "";
                return adminDashDataService.getSpeakers();
            }).then(function(speakers) {
                $scope.speakers = speakers;
            });
        }

        function removeSpeaker(speaker) {
            adminDashDataService.removeSpeaker(speaker).then(function(result) {
                return adminDashDataService.getSpeakers();
            }).then(function(speakers) {
                $scope.speakers = speakers;
            });
        }

        function addAdmin() {
            adminDashDataService.addAdmin($scope.ctrl.admin).then(function(result) {
                $scope.ctrl.admin = "";
                return adminDashDataService.getAdmins();
            }).then(function(admins) {
                $scope.admins = admins;
            }).catch(function(err) {
                console.log("Could not get list of admins:" + err);
            });
        }

        function removeAdmin(email) {
            adminDashDataService.removeAdmin(email).then(function(result) {
                return adminDashDataService.getAdmins();
            }).then(function(admins) {
                $scope.admins = admins;
            }).catch(function(err) {
                console.log("Could not get list of admins:" + err);
            });
        }

        function getApprovedTweetsOnlyStatus() {
            adminDashDataService.getApprovedTweetsOnlyStatus().then(function(result) {
                $scope.ctrl.approvedTweetsOnly = result.status;
            }).catch(function(err) {
                console.log("Could not get current approved tweets status:" + err);
            });
        }
    }

})();
