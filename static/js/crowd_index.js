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
        // json from server
        stats: {
            words_raw: '...',
            words_approved: '...', 
            words_sliced: '...',
            words_total: '...',
        },

        loadStats: function() {
            console.log('[IndexView.loadStats] ...');
            $http.get('/stats')
                .success(function(data,status,headers,config) {
                    console.log('...[IndexView.loadStats] success');
                    $scope.IndexView.stats = data;
                })
                .error(function(data,status,headers,config) {
                    console.log('...[IndexView.loadStats] error');
                });
        },

    }

    //--------------------------------------------------------------------------------
    // MAIN

    console.log('[main] --------------------------------------------------------------\\');

    $scope.IndexView.loadStats();

    console.log('[main] --------------------------------------------------------------/');

});




