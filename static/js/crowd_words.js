"use strict";


var crowdWordsApp = angular.module('crowdWordsApp', ['ui']);


// make Angular use (( )) for template markup instead of {{ }}
//  to avoid a conflict with Flask's templates which also use {{ }}
crowdWordsApp.config(function($interpolateProvider,$locationProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
    $locationProvider.html5Mode(false);
});


crowdWordsApp.controller('CrowdWordsController', function($scope, $http, $routeParams, $location) {

    //================================================================================

    $scope.WordsView = {
        // json from server
        word: {},
            // annotation_id
            // photo_id
            // model: "SALE",
            // chars: [
            //     {
            //         start: 0.342,
            //         end: 0.459,
            //         model: "S",
            //     },
            //     { ... },
            // ],
        state: 'loading', // one of: loading, ready, saving

        load: function(annotation_id) {
            console.log('[WordsView.load] loading annotation_id ' + annotation_id + ' ...');

            $http.get('/word/next')
                .success(function(data,status,headers,config) {
                    console.log('...[WordsView.load] success');
                    $scope.WordsView.word = data;
                    $scope.WordsView.state = 'ready';
                })
                .error(function(data,status,headers,config) {
                    console.log('...[WordsView.load] error');
                });

        },
    }

    //--------------------------------------------------------------------------------
    // MAIN

    console.log('[main] --------------------------------------------------------------\\');

    // depending on URL, switch to appropriate view
    var path = $location.path();
    console.log('[main] path = ' + path);

    $scope.WordsView.load(0);

    console.log('[main] --------------------------------------------------------------/');

});




