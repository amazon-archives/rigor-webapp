"use strict";

//================================================================================
// preview


function Point(x, y) {
    this.x = Number(x);
    this.y = Number(y);
}

var doCrop = function(boundary) {
    // these points must be in counter-clockwise order
    var p1 = new Point(boundary[0][0], boundary[0][1]);
    var p2 = new Point(boundary[3][0], boundary[3][1]);
    var p3 = new Point(boundary[2][0], boundary[2][1]);
    var p4 = new Point(boundary[1][0], boundary[1][1]);

    var src_canvas = document.getElementById('preview-canvas-source')
        , src_ctx = src_canvas.getContext('2d')
        , crop_canvas = document.getElementById('preview-canvas-crop')
        , crop_ctx = crop_canvas.getContext('2d')
        , img = document.getElementById('main-img')
    ;

    var im_w = img.offsetWidth, im_h = img.offsetHeight; // this should be set to crop region
    console.log(im_w, im_h);
    src_canvas.width = im_w; src_canvas.height = im_h;
    //crop_canvas.width = im_w; crop_canvas.height = im_h;

    src_ctx.drawImage(img, 0, 0);

    var imageData = src_ctx.getImageData(0, 0, im_w, im_h)
        , pImageData = imageData.data;

    // from left-top corner, counter-clockwise, p1 -> p2 -> p3 -> p4
    // map to new cord sytem
    var crop_w = 250, crop_h = 100;
    var cropImageData = crop_ctx.createImageData(crop_w, crop_h)
        , pCropImageData = cropImageData.data;

    for (var x = 0; x < crop_w; x++) {
        for (var y = 0; y < crop_h; y++) {
            var u = x / crop_w, v = y / crop_h; // x, y is coordinate in croped image
            var x0 = 0, y0 = 0; // x0, y0 is coordinate in original image

            var tmpx1 = (1 - u) * p1.x + u * p4.x
                , tmpx2 = (1 - u) * p2.x + u * p3.x
                , tmpy1 = (1 - u) * p1.y + u * p4.y
                , tmpy2 = (1 - u) * p2.y + u * p3.y;
            x0 = (1 - v) * tmpx1 + v * tmpx2;
            y0 = (1 - v) * tmpy1 + v * tmpy2;
            // console.log(x, y);
            // console.log(x0, y0);
    
            var val = bilinear_unrolled(pImageData, x0, y0, im_w);
            var i0 = 4 * (y0 * im_w + x0) // index for original image
                , i1 =  4 * (y * crop_w + x)// index for crop image
            ;
            pCropImageData[i1] = val[0];
            pCropImageData[i1+1] = val[1];
            pCropImageData[i1+2] = val[2];
            pCropImageData[i1+3] = 255; 
        }
    }
    crop_ctx.putImageData(cropImageData, 0, 0);
};
// Ref: http://jsperf.com/pixel-interpolation/2
function bilinear_unrolled(pixels, x, y, width) {
    var percentX = x - (x ^ 0);
    var percentX1 = 1.0 - percentX;
    var percentY = y - (y ^ 0);
    var percentY1 = 1.0 - percentY;
    var fx4 = (x ^ 0) * 4;
    var cx4 = fx4 + 4;
    var fy4 = (y ^ 0) * 4;
    var cy4wr = (fy4 + 4) * width;
    var fy4wr = fy4 * width;
    var cy4wg = cy4wr + 1;
    var fy4wg = fy4wr + 1;
    var cy4wb = cy4wr + 2;
    var fy4wb = fy4wr + 2;
    var top, bottom, r, g, b;

    top = pixels[cy4wr + fx4] * percentX1 + pixels[cy4wr + cx4] * percentX;
    bottom = pixels[fy4wr + fx4] * percentX1 + pixels[fy4wr + cx4] * percentX;
    r = top * percentY + bottom * percentY1;

    top = pixels[cy4wg + fx4] * percentX1 + pixels[cy4wg + cx4] * percentX;
    bottom = pixels[fy4wg + fx4] * percentX1 + pixels[fy4wg + cx4] * percentX;
    g = top * percentY + bottom * percentY1;

    top = pixels[cy4wb + fx4] * percentX1 + pixels[cy4wb + cx4] * percentX;
    bottom = pixels[fy4wb + fx4] * percentX1 + pixels[fy4wb + cx4] * percentX;
    b = top * percentY + bottom * percentY1;

    return [r, g, b];
}

function clip() {
    var p1, p2, p3, p4;
    p1 = new Point(document.getElementById('p1x').value, document.getElementById('p1y').value);
    p2 = new Point(document.getElementById('p2x').value, document.getElementById('p2y').value);
    p3 = new Point(document.getElementById('p3x').value, document.getElementById('p3y').value);
    p4 = new Point(document.getElementById('p4x').value, document.getElementById('p4y').value);
    main(p1, p2, p3, p4);
}



//================================================================================
// angular

var crowdImagesApp = angular.module('crowdImagesApp', ['ui']);


// make Angular use (( )) for template markup instead of {{ }}
//  to avoid a conflict with Flask's templates which also use {{ }}
crowdImagesApp.config(function($interpolateProvider,$locationProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
    $locationProvider.html5Mode(false);
});

crowdImagesApp.controller('CrowdImagesController', function($scope, $http, $routeParams, $timeout, $location) {

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
        isBrowserModalVisible: false,
        isHelpModalVisible: false,
        dragState: {}, // is {} when mouse button is up
            // iiBeingDragged
            // startX  // mouse down position
            // startY
            // dX      // mouse movement amount
            // dY
            // originalBoundary // original word box before dragging started
            // shiftKey    // was shift key down when initial mousedown happened

        doBrowserCheck: function() {
            var browserName = BrowserDetect.browser;
            console.log('[ImagesView.doBrowserCheck] = ' + browserName);
            if (browserName !== "Chrome") {
                $scope.ImagesView.isBrowserModalVisible = true;
            }
        },

        clickDismissBrowserWarning: function() {
            $scope.ImagesView.isBrowserModalVisible = false;
        },

        clickShowHelp: function() {
            $scope.ImagesView.isHelpModalVisible = true;
        },
        clickDismissHelp: function() {
            $scope.ImagesView.isHelpModalVisible = false;
        },

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
            // update preview
            $timeout(function() {doCrop($scope.ImagesView.selected_word.boundary)}, 0);
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
            dragState.shiftKey = $event.shiftKey;
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

            var speed = dragState.shiftKey ? 0.2 : 1.0;

            // compute new position of this corner of the boundary box
            if (dragState.kind === 'corner') {
                $scope.ImagesView.selected_word.boundary[ii][0] = dragState.originalBoundary[ii][0] + dragState.dX * speed;
                $scope.ImagesView.selected_word.boundary[ii][1] = dragState.originalBoundary[ii][1] + dragState.dY * speed;
                // // keep in bounds
                $scope.ImagesView.selected_word.boundary[ii][0] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.x_resolution, $scope.ImagesView.selected_word.boundary[ii][0])));
                $scope.ImagesView.selected_word.boundary[ii][1] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.y_resolution, $scope.ImagesView.selected_word.boundary[ii][1])));
            } else if (dragState.kind === 'skew') {
                var ii2 = (ii+1) % 4;
                // when moving a skew handle, move both corners at the same time
                $scope.ImagesView.selected_word.boundary[ii][0] = dragState.originalBoundary[ii][0] + dragState.dX * speed;
                $scope.ImagesView.selected_word.boundary[ii][1] = dragState.originalBoundary[ii][1] + dragState.dY * speed;
                $scope.ImagesView.selected_word.boundary[ii2][0] = dragState.originalBoundary[ii2][0] + dragState.dX * speed;
                $scope.ImagesView.selected_word.boundary[ii2][1] = dragState.originalBoundary[ii2][1] + dragState.dY * speed;
                // // keep in bounds
                $scope.ImagesView.selected_word.boundary[ii][0] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.x_resolution, $scope.ImagesView.selected_word.boundary[ii][0])));
                $scope.ImagesView.selected_word.boundary[ii][1] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.y_resolution, $scope.ImagesView.selected_word.boundary[ii][1])));
                $scope.ImagesView.selected_word.boundary[ii2][0] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.x_resolution, $scope.ImagesView.selected_word.boundary[ii2][0])));
                $scope.ImagesView.selected_word.boundary[ii2][1] = Math.floor(Math.max(0, Math.min($scope.ImagesView.image.y_resolution, $scope.ImagesView.selected_word.boundary[ii2][1])));
            } else {
                console.error('[ImagesView.handleMouseMove] unknown drag kind: ' + dragState.kind);
            }


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

            // update preview
            $timeout(function() {doCrop($scope.ImagesView.selected_word.boundary)}, 0);

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

    $scope.ImagesView.doBrowserCheck();

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




