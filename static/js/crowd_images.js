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
            statsFreq: 9,  // update stats every this many seconds
        },
        // json from server
        stats: {},
            // words_raw: 29,
            // words_approved: 29,
            // words_sliced: 29,
            // words_total: 104,
            // words_progress: 0.03,
        image: {},
            // image_id
        state: 'loading', // one of: loading, ready, saving (not implemented yet), empty (e.g. nothing to show)

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

         clickSkipButton: function() {
             console.log('[ImagesView.clickSkipButton]');
             $scope.ImagesView.loadImage();
             // refresh stats once
             $timeout(function() { $scope.ImagesView.loadStats(false) }, 1000);
         },

         clickSaveButton: function() {
             console.log('[ImagesView.clickSaveButton]');

             // save
             $scope.ImagesView.state = 'saving';
             $http.post('/image/save', $scope.ImagesView.image) // foo
                 .success(function(data,status,headers,config) {
                     console.log('...[ImagesView.clickSaveButton] success');

                     // load next image
                     $scope.ImagesView.loadImage();
                     
                     // update stats
                     $scope.ImagesView.stats.words_raw = $scope.ImagesView.stats.words_raw - 1;
                     $scope.ImagesView.stats.words_approved = $scope.ImagesView.stats.words_approved + 1;
                     // refresh stats once
                     $timeout(function() { $scope.ImagesView.loadStats(false) }, 1000);

                 })
                 .error(function(data,status,headers,config) {
                     console.log('...[ImagesView.clickSaveButton] error');
                 });
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




