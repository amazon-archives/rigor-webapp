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
        stats: {},
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

        loadStats: function() {
            console.log('[WordsView.loadStats] ...');
            $http.get('/stats')
                .success(function(data,status,headers,config) {
                    console.log('...[WordsView.loadStats] success');
                    $scope.WordsView.stats = data;
                })
                .error(function(data,status,headers,config) {
                    console.log('...[WordsView.loadStats] error');
                });
        },

        loadWord: function(annotation_id) {
            // set annotation_id to 0 or undefined to get the next word that needs to be done

            // get a specific word or just the next available one
            var wordUrl;
            if (annotation_id === 0 || annotation_id === undefined) {
                console.log('[WordsView.loadWord] loading next available annotation_id ...');
                wordUrl = '/word/next';
            } else {
                console.log('[WordsView.loadWord] loading annotation_id ' + annotation_id + ' ...');
                wordUrl = '/word/' + annotation_id;
            }

            // clear state
            $scope.WordsView.state = 'loading';
            $scope.WordsView.word = {};

            // get new data
            $http.get(wordUrl)
                .success(function(data,status,headers,config) {
                    console.log('...[WordsView.loadWord] success');
                    $scope.WordsView.word = data;
                    $scope.WordsView.state = 'ready';
                    $location.path(''+$scope.WordsView.word.annotation_id);
                })
                .error(function(data,status,headers,config) {
                    console.log('...[WordsView.loadWord] error');
                });
         },

         clickSkipButton: function() {
             console.log('[WordsView.clickSkipButton]');
             $scope.WordsView.loadWord();
         },

         clickSaveButton: function() {
             console.log('[WordsView.clickSaveButton]');
             $scope.WordsView.loadWord();
         },
    }

    //--------------------------------------------------------------------------------
    // MAIN

    console.log('[main] --------------------------------------------------------------\\');

    // depending on URL, switch to appropriate view
    var path = $location.path();
    console.log('[main] path = ' + path);

    if (path === '/words') {
        $scope.WordsView.loadWord();
    } else {
        // should look like '/1932'
        var id = parseInt(path.substring(1),10);
        console.log(id)
        $scope.WordsView.loadWord(id);
    }
    $scope.WordsView.loadStats();

    console.log('[main] --------------------------------------------------------------/');

});




