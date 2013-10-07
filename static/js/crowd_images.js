"use strict";


var crowdImagesApp = angular.module('crowdImagesApp', ['ui']);


// make Angular use (( )) for template markup instead of {{ }}
//  to avoid a conflict with Flask's templates which also use {{ }}
crowdImagesApp.config(function($interpolateProvider,$locationProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
    $locationProvider.html5Mode(false);
});


crowdImagesApp.controller('CrowdImagesController', function($scope, $http, $routeParams, $timeout, $location) {

    //================================================================================

    $scope.ImagesView = {
        config: {
            statsFreq: 20,  // update stats every this many seconds
            cornerHandleSize: 18,
            skewHandleSize: 18,
        },
        // json from server
        stats: {},
            // words_raw: 29,
            // words_approved: 29,
            // words_sliced: 29,
            // words_total: 104,
            // words_progress: 0.03,
        image: {},
            // depth
            // format
            // hash
            // image_id
            // locator
            // source_id
            // stamp
            // tags
            // thumb_url
            // url
            // x_resolution
            // y_resolution
            // words
            //    annotation_id
            //    image_id
            //    confidence
            //    boundary
            //    stamp
            //    model
            //    domain

        selected_word: {},
        state: 'loading', // one of: loading, ready, saving (not implemented yet), empty (e.g. nothing to show)
        dragState: {}, // is {} when mouse button is up
            // iiBeingDragged
            // startX  // mouse down position
            // startY
            // dX      // mouse movement amount
            // dY
            // originalBoundary // original word box before dragging started

        loadStats: function(repeat) {
            // repeat is a bool
            console.log('[ImagesView.loadStats] repeat = ' + repeat + ' ...');
            $http.get('/stats')
                .success(function(data,status,headers,config) {
                    console.log('...[ImagesView.loadStats] success');
                    $scope.ImagesView.stats = data;
                    if (repeat) {
                        $timeout(
                            function() { $scope.ImagesView.loadStats(true); },
                            $scope.ImagesView.config.statsFreq * 1000
                        );
                    }
                })
                .error(function(data,status,headers,config) {
                    console.log('...[ImagesView.loadStats] error');
                    if (repeat) {
                        $timeout(
                            function() { $scope.ImagesView.loadStats(true); },
                            $scope.ImagesView.config.statsFreq * 1000
                        );
                    }
                });
        },

        loadImage: function(image_id) {
            // set image_id to 0 or undefined to get the next image that needs to be done

            // get a specific image or just the next available one
            var imageUrl;
            if (image_id === 0 || image_id === undefined) {
                console.log('[ImagesView.loadImage] loading next available image_id ...');
                imageUrl = '/image/next';
            } else {
                console.log('[ImagesView.loadImage] loading image_id ' + image_id + ' ...');
                imageUrl = '/image/' + image_id;
            }

            // clear state
            $scope.ImagesView.state = 'loading';
            $scope.ImagesView.image = {};
            $scope.ImagesView.selected_word = {};
            $scope.ImagesView.dragState = {};

            // get new data
            $http.get(imageUrl)
                .success(function(data,status,headers,config) {
                    console.log('...[ImagesView.loadImage] success: image_id = ' + data.image_id);
                    $scope.ImagesView.image = data;
                    $scope.ImagesView.state = 'ready';
                    $location.path(''+$scope.ImagesView.image.image_id);
                })
                .error(function(data,status,headers,config) {
                    $scope.ImagesView.state = 'empty';
                    console.log('...[ImagesView.loadImage] error');
                });
        },

        boundaryToSvgPoints: function(boundary) {
            var result = '';
            angular.forEach(boundary, function(point,ii) {
                result = result + point[0] + ',' + point[1] + ' ';
            });
            return result;
        },

        clickSkipButton: function() {
            console.log('[ImagesView.clickSkipButton]');
            $scope.ImagesView.loadImage();
            // refresh stats once
            $timeout(function() { $scope.ImagesView.loadStats(false) }, 1000);
        },

        clickRejectButton: function() {
            return; // hack
            console.log('[ImagesView.clickRejectButton]');

            // reject
            $scope.ImagesView.state = 'saving';
            $http.post('/image/reject/' + $scope.ImagesView.image.image_id) // foo
                .success(function(data,status,headers,config) {
                    console.log('...[ImagesView.clickRejectButton] success');

                    // update stats
                    $scope.ImagesView.stats.words_raw = $scope.ImagesView.stats.words_raw - $scope.ImagesView.image.words.length;
                    // refresh stats once
                    $timeout(function() { $scope.ImagesView.loadStats(false) }, 1000);

                    // load next image
                    $scope.ImagesView.loadImage();
                })
                .error(function(data,status,headers,config) {
                    console.log('...[ImagesView.clickRejectButton] error');
                });
        },

        clickSaveButton: function() {
            console.log('[ImagesView.clickSaveButton]');

            // save
            $scope.ImagesView.state = 'saving';
            $http.post('/image/save', JSON.stringify($scope.ImagesView.image)) // foo
                .success(function(data,status,headers,config) {
                    console.log('...[ImagesView.clickSaveButton] success');

                    // update stats
                    $scope.ImagesView.stats.words_raw = $scope.ImagesView.stats.words_raw - $scope.ImagesView.image.words.length;
                    $scope.ImagesView.stats.words_approved = $scope.ImagesView.stats.words_approved + $scope.ImagesView.image.words.length;
                    // refresh stats once
                    $timeout(function() { $scope.ImagesView.loadStats(false) }, 1000);

                    // load next image
                    $scope.ImagesView.loadImage();
                })
                .error(function(data,status,headers,config) {
                    console.log('...[ImagesView.clickSaveButton] error');
                });
        },

        clickWord: function(word) {
            console.log('[ImagesView.clickWord] ' + word['annotation_id']);
            console.log(word);
            $scope.ImagesView.selected_word = word;
        },

        clickToDeselect: function() {
            console.log('[ImagesView.clickToDeselect]');
            $scope.ImagesView.selected_word = {};
        },

        isSelectedWord: function(word) {
            return word['annotation_id'] === $scope.ImagesView.selected_word['annotation_id'];
        },

        anythingIsSelected: function() {
            return $scope.ImagesView.selected_word.hasOwnProperty('annotation_id');
        },

        selectedBoundary: function() {
            if ($scope.ImagesView.selected_word.hasOwnProperty('annotation_id')) {
                return $scope.ImagesView.selected_word.boundary;
            }
            return [[0,0],[0,0],[0,0],[0,0]];
        },


        handleMouseDown: function(kind,ii,$event) {
            // kind should be either "corner" or "skew"
            console.log('[ImagesView.handleMouseDown] ii = ' + ii);
            console.log(event);
            $scope.ImagesView.dragState = {};
            var dragState = $scope.ImagesView.dragState;
            dragState.iiBeingDragged = ii;
            dragState.startX = $event.x;
            dragState.startY = $event.y;
            dragState.dX = 0;
            dragState.dY = 0;
            dragState.originalBoundary = JSON.parse(JSON.stringify($scope.ImagesView.selected_word.boundary));
            dragState.kind = kind;
            $event.preventDefault();
        },
        handleMouseMove: function($event) {
            // if dragState is empty, ignore mouseMove
            if (Object.keys($scope.ImagesView.dragState).length === 0) {
                return;
            }
            console.log('[ImagesView.handleMouseMove]');
            console.log(event);
            var dragState = $scope.ImagesView.dragState;
            var ii = dragState.iiBeingDragged;
            dragState.dX = $event.x - dragState.startX;
            dragState.dY = $event.y - dragState.startY;

            var speed = 1.0;
            if ($event.shiftKey) {
                speed = 0.2;
            }

            // compute new position of this corner of the boundary box
            if (dragState.kind === 'corner') {
                $scope.ImagesView.selected_word.boundary[ii][0] = dragState.originalBoundary[ii][0] + dragState.dX * speed;
                $scope.ImagesView.selected_word.boundary[ii][1] = dragState.originalBoundary[ii][1] + dragState.dY * speed;
            } else if (dragState.kind === 'skew') {
                var ii2 = (ii+1) % 4;
                // when moving a skew handle, move both corners at the same time
                $scope.ImagesView.selected_word.boundary[ii][0] = dragState.originalBoundary[ii][0] + dragState.dX * speed;
                $scope.ImagesView.selected_word.boundary[ii][1] = dragState.originalBoundary[ii][1] + dragState.dY * speed;
                $scope.ImagesView.selected_word.boundary[ii2][0] = dragState.originalBoundary[ii2][0] + dragState.dX * speed;
                $scope.ImagesView.selected_word.boundary[ii2][1] = dragState.originalBoundary[ii2][1] + dragState.dY * speed;
            } else {
                console.error('[ImagesView.handleMouseMove] unknown drag kind: ' + dragState.kind);
            }

            // // keep in bounds
            $scope.ImagesView.selected_word.boundary[ii][0] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.x_resolution, $scope.ImagesView.selected_word.boundary[ii][0])));
            $scope.ImagesView.selected_word.boundary[ii][1] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.y_resolution, $scope.ImagesView.selected_word.boundary[ii][1])));

            $event.preventDefault();
        },
        handleMouseUp: function($event) {
            // mouseUp comes from the body tag, not the individual handle tags
            // if dragState is empty, ignore mouseUp
            if (Object.keys($scope.ImagesView.dragState).length === 0) {
                return;
            }
            console.log('[ImagesView.handleMouseUp]');
            console.log(event);
            $scope.ImagesView.dragState = {};
            $event.preventDefault();
        },

    }

    //--------------------------------------------------------------------------------
    // MAIN

    console.log('[main] --------------------------------------------------------------\\');

    // depending on URL, switch to appropriate view
    var path = $location.path();
    console.log('[main] path = ' + path);

    if (path === '/images') {
        $scope.ImagesView.loadImage();
    } else {
        // should look like '/1932'
        var id = parseInt(path.substring(1),10);
        console.log(id)
        $scope.ImagesView.loadImage(id);
    }
    $scope.ImagesView.loadStats(true);

    console.log('[main] --------------------------------------------------------------/');

});




