"use strict";


var crowdIndexApp = angular.module('crowdIndexApp', []);


// make Angular use (( )) for template markup instead of {{ }}
//  to avoid a conflict with Flask's templates which also use {{ }}
crowdIndexApp.config(function($interpolateProvider,$locationProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
    $locationProvider.html5Mode(false);
});


crowdIndexApp.controller('CrowdIndexController', function($scope, $http, $routeParams, $timeout, $location) {

    //================================================================================

    $scope.IndexView = {
        config: {
            statsFreq: 5,  // update stats every this many seconds
        },
        // json from server
        stats: {
            words_raw: '...',
            words_approved: '...', 
            words_sliced: '...',
            words_total: '...',
        },

        loadStats: function(repeat) {
            // repeat is a bool
            console.log('[IndexView.loadStats] repeat = ' + repeat + ' ...');
            $http.get('/stats')
                .success(function(data,status,headers,config) {
                    console.log('...[IndexView.loadStats] success');
                    $scope.IndexView.stats = data;
                    if (repeat) {
                        $timeout(
                            function() { $scope.IndexView.loadStats(true); },
                            $scope.IndexView.config.statsFreq * 1000
                        );
                    }
                })
                .error(function(data,status,headers,config) {
                    console.log('...[IndexView.loadStats] error');
                    if (repeat) {
                        $timeout(
                            function() { $scope.IndexView.loadStats(true); },
                            $scope.IndexView.config.statsFreq * 1000
                        );
                    }
                });
        },

    }

    //--------------------------------------------------------------------------------
    // MAIN

    console.log('[main] --------------------------------------------------------------\\');

    $scope.IndexView.loadStats(true);

    console.log('[main] --------------------------------------------------------------/');

});




