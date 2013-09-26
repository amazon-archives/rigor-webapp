"use strict";


var crowdWordsApp = angular.module('crowdWordsApp', ['ui']);


// make Angular use (( )) for template markup instead of {{ }}
//  to avoid a conflict with Flask's templates which also use {{ }}
crowdWordsApp.config(function($interpolateProvider,$locationProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
    $locationProvider.html5Mode(false);
});


crowdWordsApp.controller('CrowdWordsController', function($scope, $http, $routeParams, $timeout, $location) {

    //================================================================================


    $scope.WordsView = {
        config: {
            // TODO: get this from the backend
            MIN_CHAR_WIDTH: 0.02,
            statsFreq: 9,  // update stats every this many seconds
        },
        // json from server
        stats: {},
            // words_raw: 29,
            // words_approved: 29,
            // words_sliced: 29,
            // words_total: 104,
        word: {},
            // annotation_id
            // image_id
            // ext
            // x_res
            // y_res
            // image_url
            // model: "SALE",
            // chars: [
            //     {
            //         start: 0.342,
            //         end: 0.459,
            //         model: "S",
            //     },
            //     { ... },
            // ],
        state: 'loading', // one of: loading, ready, saving (not implemented yet), empty (e.g. nothing to show)
        dragState: {}, // is {} when mouse button is up
            // charBeingDragged: {}
            // kind    // either 'start' or 'end'
            // startX
            // startY
            // dX
            // dY

        loadStats: function(repeat) {
            // repeat is a bool
            console.log('[WordsView.loadStats] repeat = ' + repeat + ' ...');
            $http.get('/stats')
                .success(function(data,status,headers,config) {
                    console.log('...[WordsView.loadStats] success');
                    $scope.WordsView.stats = data;
                    if (repeat) {
                        $timeout(
                            function() { $scope.WordsView.loadStats(true); },
                            $scope.WordsView.config.statsFreq * 1000
                        );
                    }
                })
                .error(function(data,status,headers,config) {
                    console.log('...[WordsView.loadStats] error');
                    if (repeat) {
                        $timeout(
                            function() { $scope.WordsView.loadStats(true); },
                            $scope.WordsView.config.statsFreq * 1000
                        );
                    }
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
            $scope.WordsView.dragState = {};

            // get new data
            $http.get(wordUrl)
                .success(function(data,status,headers,config) {
                    console.log('...[WordsView.loadWord] success');
                    $scope.WordsView.word = data;
                    $scope.WordsView.state = 'ready';
                    $location.path(''+$scope.WordsView.word.annotation_id);
                })
                .error(function(data,status,headers,config) {
                    $scope.WordsView.state = 'empty';
                    console.log('...[WordsView.loadWord] error');
                });
         },

         clickSkipButton: function() {
             console.log('[WordsView.clickSkipButton]');
             $scope.WordsView.loadWord();
             // refresh stats once
             $timeout(function() { $scope.WordsView.loadStats(false) }, 1000);
         },

         clickSaveButton: function() {
             console.log('[WordsView.clickSaveButton]');

             // save
             $scope.WordsView.state = 'saving';
             $http.post('/word/save', $scope.WordsView.word)
                 .success(function(data,status,headers,config) {
                     console.log('...[WordsView.clickSaveButton] success');

                     // load next word
                     $scope.WordsView.loadWord();
                     
                     // update stats
                     $scope.WordsView.stats.words_approved = $scope.WordsView.stats.words_approved - 1;
                     $scope.WordsView.stats.words_sliced = $scope.WordsView.stats.words_sliced + 1;
                     // refresh stats once
                     $timeout(function() { $scope.WordsView.loadStats(false) }, 1000);

                 })
                 .error(function(data,status,headers,config) {
                     console.log('...[WordsView.clickSaveButton] error');
                 });
         },

         sushiHandleMouseDown: function(char,kind,$event) {
             // kind is either 'start' or 'end'

             console.log('[WordsView.sushiHandleMouseDown] kind = ' + kind + ', char = ' + char.model);
             console.log(event);
             $scope.WordsView.dragState = {};
             var dragState = $scope.WordsView.dragState;
             dragState.charBeingDragged = char;
             char.originalStart = char.start;
             char.originalEnd = char.end;
             dragState.startX = $event.x;
             dragState.startY = $event.y;
             dragState.dX = 0;
             dragState.dY = 0;
             dragState.kind = kind;
             $event.preventDefault();
         },
         sushiHandleMouseMove: function($event) {
             // if dragState is empty, ignore mouseMove
             if (Object.keys($scope.WordsView.dragState).length === 0) {
                 return;
             }
             console.log('[WordsView.sushiHandleMouseMove]');
             console.log(event);
             var dragState = $scope.WordsView.dragState;
             var char = dragState.charBeingDragged;
             dragState.dX = $event.x - dragState.startX;
             dragState.dY = $event.y - dragState.startY;

             if (dragState.kind === 'start') {
                 // figure out new position
                 char.start = char.originalStart + dragState.dX / $scope.WordsView.word.x_res;
                 // keep in bounds
                 char.start = Math.max(0, Math.min(1 - $scope.WordsView.config.MIN_CHAR_WIDTH, char.start));
                 // push end marker
                 char.end = Math.max(char.originalEnd, char.start + $scope.WordsView.config.MIN_CHAR_WIDTH);
             } else {
                 // figure out new position
                 char.end = char.originalEnd + dragState.dX / $scope.WordsView.word.x_res;
                 // keep in bounds
                 char.end = Math.max($scope.WordsView.config.MIN_CHAR_WIDTH, Math.min(1, char.end));
                 // push start marker
                 char.start = Math.min(char.originalStart, char.end - $scope.WordsView.config.MIN_CHAR_WIDTH);
             }

             $event.preventDefault();
         },
         sushiHandleMouseUp: function($event) {
             // mouseUp comes from the body tag, not the individual handle tags
             // if dragState is empty, ignore mouseUp
             if (Object.keys($scope.WordsView.dragState).length === 0) {
                 return;
             }
             console.log('[WordsView.sushiHandleMouseUp]');
             console.log(event);
             delete $scope.WordsView.dragState.charBeingDragged.originalStart;
             delete $scope.WordsView.dragState.charBeingDragged.originalEnd;
             $scope.WordsView.dragState = {};
             $event.preventDefault();
         },
    }

    // when user changes the model in the edit box...
    $scope.$watch('WordsView.word.model', function(newValue,oldValue) {
        console.log('[model watch] model changed: ' + oldValue + ' --> ' + newValue);
        if (oldValue === undefined || newValue === undefined) { return; }
        // recompute sushi slices
        $scope.WordsView.word.chars = [];
        for (var ii = 0; ii < newValue.length; ii++ ) {
            $scope.WordsView.word.chars.push({
                start: (ii + 0.05) / newValue.length,
                end: (ii + 0.95) / newValue.length,
                model: newValue[ii],
            });
        }
    });

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
    $scope.WordsView.loadStats(true);

    console.log('[main] --------------------------------------------------------------/');

});




