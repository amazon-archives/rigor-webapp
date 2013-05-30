"use strict";


var browseApp = angular.module('browseApp', ['ui']);


// make Angular use (( )) for template markup instead of {{ }}
// to avoid a conflict with Flask's templates which also use {{ }}
browseApp.config(function($interpolateProvider,$locationProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
    $locationProvider.html5Mode(false);
});


browseApp.controller('BrowseController', function($scope, $http, $routeParams, $location) {

    //================================================================================
    // CONSTANTS AND UTILS

    // ANY is a special value to represent that we should ignore this field
    // when searching.  this is equivalent to ''.
    // When we convert $scope.query to query params for the API, we
    // omit any items which are ANY or ''.
    var ANY = '(any)';

    var FILLED_ANNOTATIONS = ['text:line','text:word','text:char']; // in the order we should draw them
    var OPEN_ANNOTATIONS = ['text:lineorder'];
    var ANNOTATION_TEXT_FONT_SIZE = 16;
    var ANNOTATION_TEXT_BACKGROUND_STYLE = 'hsla(0,0%,100%,0.8)';
    var ANNOTATION_COLORS = {
        'text:char': {
            fillStyle: "hsla(200,100%,45%,0.2)",
            strokeStyle: "hsla(200,100%,70%,0.8)",
            textStyle: "hsla(200,60%,40%,0.9)",
            lineWidth: 2,
            textYOffset: 0,
            circleRad: 3,
            textEnabled: true,
            geomEnabled: true
        },
        'text:word': {
            fillStyle: "hsla(130,70%,40%,0.25)",
            strokeStyle: "hsla(130,70%,30%,0.8)",
            textStyle: "hsla(130,60%,40%,0.9)",
            lineWidth: 2,
            textYOffset: 1,
            circleRad: 5,
            textEnabled: true,
            geomEnabled: true
        },
        'text:line': {
            fillStyle: "hsla(25,100%,45%,0.25)",
            strokeStyle: "hsla(25,100%,80%,0.8)",
            textStyle: "hsla(25,60%,40%,0.9)",
            lineWidth: 2,
            textYOffset: 2,
            circleRad: 7,
            textEnabled: true,
            geomEnabled: true
        },
        'text:lineorder': {
            thickStrokeStyle: "hsla(260,80%,70%,0.5)",
            thickLineWidth: 7,
            thinStrokeStyle: "hsla(260,80%,30%,0.3)",
            thinLineWidth: 2,
            geomEnabled: true
        }
    };

    var tokenizeString = function(s) {
        // given a string like "   tag1 tag2 \n   tag3 "
        // return ['tag1','tag2','tag3']
        var result = [];
        angular.forEach(s.trim().split(' '), function(token,ii) {
            token = token.trim();
            if (token.length > 0) {
                result.push(token);
            }
        });
        return result;
    };





    //================================================================================
    //================================================================================
    // SEARCH FORM
/*
    $scope.view_state_obj = {            // which view mode we're in.
        render_path: 'thumbs'        // 'thumbs', 'detail'
    };

    $scope.thumb_view_obj = {
        search_form_obj: {
            database_names: ['blindsight'],
            available_tags: [],
        };
    };
    $scope.thumb_view_obj.search_form_obj = {};

    $scope.detail_view_obj = {};

*/















    //================================================================================
    // SCOPES

    $scope.view_state = {            // which view mode we're in.
        render_path: 'thumbs'        // 'thumbs', 'detail'
    };
    $scope.search_form = {           // choices for drop-downs.  to be filled in via AJAX
        database_names: ['blindsight'],
        tags: [],
        has_tags_select2_settings: {
            tags: [],
            tokenSeparators: [',', ' ']
        }
    };
    $scope.query = {                 // query params for searching images
        database_name: 'blindsight',      // TODO: this should be set to config.INITIAL_DB_NAME
        //has_tags: 'sightpal angle testing bigangle',
        has_tags: '',
        has_tags_select2_choices: [],
        exclude_tags: '',
        max_count: 18,
        page: 0
    };
    $scope.search_results = {
        search_has_occurred: false,   // has a search occurred yet?
        images: [],                   // results of the search
        full_count: 0,                // number of returned images (all pages)
        last_page: 0                  // number of pages
    };
    $scope.detail = {
        image: undefined,             // json for the image being viewed
        annotations: [],              // json for the annotations
    };

    //================================================================================
    // SEARCH FORM BUTTONS AND BEHAVIOR

    $scope.clickSearchFormClearButton = function() {
        $scope.query.has_tags = '';
        $scope.query.exclude_tags = '';
        $scope.query.page = 0;

        $scope.switchToThumbView();
        $scope.doSearch();
    };

    $scope.clickSearchFormSearchButton = function() {
        $scope.switchToThumbView();
        $scope.query.page = 0;
        $scope.doSearch();
    };

    $scope.getHasTagsChoices = function() {
        var result = [];
        angular.forEach($scope.query.has_tags_select2_choices, function(obj,ii) {
            result.push(obj.text);
        });
        return result
    };

    $scope.setHasTagsOptions = function(tags) {
        // empty out the tag list while keeping it the same list object in memory
        // dump the tags into the select2 tag list while keeping it the same list object
        var select2tags = $scope.search_form.has_tags_select2_settings.tags;
        while (select2tags.length > 0) {
            select2tags.pop();
        }
        select2tags.push.apply(select2tags,tags);
    };

    // when user changes database name, re-fetch tags
    $scope.$watch('query.database_name', function(newValue,oldValue) {
        console.log('[watch database_name] ----------------------------------------\\');
        console.log('[watch database_name] db name changed from ' + oldValue + ' to ' + newValue + ', so re-fetching tags');

        $scope.search_form.tags = [];

        // fill in tags
        console.log('[watch database_name] getting tags...');
        $http.get('/api/v1/db/'+$scope.query.database_name+'/tag')
            .success(function(data,status,headers,config) {
                $scope.search_form.tags = data['d'];
                $scope.setHasTagsOptions(data['d']);
                console.log('...[watch database_name] got tags: ' + $scope.search_form.tags);
            })
            .error(function(data,status,headers,config) {
                console.log('...[watch database_name] error getting tags');
            });

        console.log('[watch database_name] ----------------------------------------/');
    });


    //================================================================================
    // DO SEARCH

    $scope.doSearch = function(callback) {
        console.log('[do_search] ----------------------------------------\\');
        console.log('[do_search] getting images...');

        $scope.search_results.search_has_occurred = true;

        $location.search($scope.query);

        // clean up query object for use as URL params
        var queryParams = angular.copy($scope.query);
        queryParams.has_tags = tokenizeString(queryParams.has_tags).join();
        queryParams.exclude_tags = tokenizeString(queryParams.exclude_tags).join();

        angular.forEach(queryParams, function(value,key) {
            if (value === ANY || value === '') {
                delete queryParams[key];
            }
        });
        console.log('[do_search] query = ');
        console.log(queryParams);

        $http.get('/api/v1/search',{params: queryParams})
            .success(function(data,status,headers,config) {
                $scope.search_results.images = data['images'];
                $scope.search_results.full_count = data['full_count'];
                $scope.search_results.last_page = Math.floor($scope.search_results.full_count / $scope.query.max_count);
                console.log('...[do_search] success. got ' + $scope.search_results.images.length + ' images');
                console.log('...[do_search] full_count = ' + $scope.search_results.full_count);
                console.log('...[do_search] last_page = ' + $scope.search_results.last_page);
                if (typeof callback !== 'undefined') {
                    console.log('...[do_search] running callback:');
                    callback();
                }
            })
            .error(function(data,status,headers,config) {
                console.log('...[do_search] error');
            });

        console.log('[do_search] ----------------------------------------/');
    };


    //================================================================================
    // THUMB PAGINATION

    $scope.thumbViewNextButtonIsEnabled = function () {
        return $scope.search_results.search_has_occurred && $scope.query.page < $scope.search_results.last_page;
    };
    $scope.thumbViewPrevButtonIsEnabled = function () {
        return $scope.search_results.search_has_occurred && $scope.query.page >= 1;
    };

    $scope.clickNextButton = function() {
        if ($scope.thumbViewNextButtonIsEnabled()) {
            console.log('next button');
            $scope.query.page += 1;
            $scope.doSearch();
        }
    };
    $scope.clickPrevButton = function() {
        if ($scope.thumbViewPrevButtonIsEnabled()) {
            console.log('prev button');
            $scope.query.page -= 1;
            $scope.doSearch();
        }
    };


    //================================================================================
    // MODIFY SEARCH BY CLICKING TAG IN DETAIL OR THUMB VIEW

    $scope.clickTag = function(tag) {
        var existingTagSearch = tokenizeString($scope.query.has_tags);

        $scope.switchToThumbView();

        // if we're not already searching for this tags...
        if (existingTagSearch.indexOf(tag) === -1) {
            // add the tag to the has_tags string
            if ($scope.query.has_tags === '') {
                $scope.query.has_tags = tag;
            } else {
                $scope.query.has_tags += ' ' + tag;
            }
            // and refresh the search
            $scope.doSearch();
        }
    };


    //================================================================================
    // POPULATING DETAIL VIEW

    var findDetailImageAndGetAnnotations = function(ii) {
        console.log('[find detail and annotations] ----------------------------------------\\');
        // find image
        $scope.detail.image = undefined;
        angular.forEach($scope.search_results.images, function(image,jj) {
            if (image.ii === ii) {
                $scope.detail.image = image;
                console.log('[find detail and annotations] found image');
            }
        });
        if (typeof $scope.detail.image == 'undefined') {
            console.error('[find detail and annotations] could not find image. ii = ' + ii);
        }

        // update hash
        $location.path('/'+$scope.detail.image.database_name+'/image/'+$scope.detail.image.locator);
        $location.search('');

        // load annotations
        console.log('[find detail and annotations] loading annotations...');
        $http.get('/api/v1/db/'+$scope.detail.image.database_name+'/image/'+$scope.detail.image.locator+'/annotation')
            .success(function(data,status,headers,config) {
                $scope.detail.annotations = data['d']
                console.log('...[find detail and annotations] success.  got ' + $scope.detail.annotations.length + ' annotations');
                console.log('...[find detail and annotations] drawing annotations');

                drawAnnotations();
            })
            .error(function(data,status,headers,config) {
                console.log('...[find detail and annotations] error');
            });

        console.log('[find detail and annotations] ----------------------------------------/');
    };

    var drawAnnotations = function() {
        var canvas = document.getElementById('image_canvas');
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,$scope.detail.image.x_resolution, $scope.detail.image.y_resolution);

        angular.forEach(FILLED_ANNOTATIONS, function(thisDomain,kk) {
            // find and draw thisDomain annotations
            if (ANNOTATION_COLORS[thisDomain].geomEnabled) {
                angular.forEach($scope.detail.annotations, function(annotation,jj) {
                    if (annotation.domain === thisDomain) {

                        // set drawing style
                        ctx.fillStyle = ANNOTATION_COLORS[thisDomain].fillStyle;
                        ctx.strokeStyle = ANNOTATION_COLORS[thisDomain].strokeStyle;
                        ctx.lineWidth = ANNOTATION_COLORS[thisDomain].lineWidth;

                        ctx.beginPath();
                        angular.forEach(annotation.boundary, function(point,kk) {
                            if (kk === 0) {
                                ctx.moveTo(point[0],point[1]);
                            } else {
                                ctx.lineTo(point[0],point[1]);
                            }
                        });
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                       
                        // thicker line on top
                        ctx.beginPath();
                        ctx.moveTo(annotation.boundary[0][0],annotation.boundary[0][1]);
                        ctx.lineTo(annotation.boundary[1][0],annotation.boundary[1][1]);
                        ctx.closePath();
                        ctx.lineWidth = 4;
                        ctx.stroke();

                        // circle in top left corner
                        ctx.beginPath();
                        var rad = ANNOTATION_COLORS[thisDomain].circleRad;
                        ctx.arc(annotation.boundary[0][0],annotation.boundary[0][1], rad, 0,2*Math.PI);
                        ctx.closePath();
                        ctx.lineWidth = 2;
                        ctx.stroke();


                    }
                });
            }
        });

        // overlay text of the annotations
        angular.forEach(FILLED_ANNOTATIONS, function(thisDomain,kk) {
            // find and draw thisDomain annotations
            if (ANNOTATION_COLORS[thisDomain].textEnabled) {
                angular.forEach($scope.detail.annotations, function(annotation,jj) {
                    if (annotation.domain === thisDomain) {
                        ctx.font = ANNOTATION_TEXT_FONT_SIZE + 'px Arial';

                        // background box
                        var textWidth = ctx.measureText(annotation.model).width;
                        var border = 1;
                        ctx.fillStyle = ANNOTATION_TEXT_BACKGROUND_STYLE;
                        ctx.fillRect(
                            annotation.boundary[0][0] - border,
                            annotation.boundary[0][1] - border - ANNOTATION_TEXT_FONT_SIZE*(0.8+ANNOTATION_COLORS[thisDomain].textYOffset),
                            textWidth + border*2,
                            ANNOTATION_TEXT_FONT_SIZE*0.8 + border*2
                        );

                        // text itself
                        ctx.fillStyle = ANNOTATION_COLORS[thisDomain].textStyle;
                        ctx.fillText(annotation.model,
                                    annotation.boundary[0][0],
                                    annotation.boundary[0][1] - ANNOTATION_TEXT_FONT_SIZE*ANNOTATION_COLORS[thisDomain].textYOffset);
                    }
                });
            }
        });

        // text:lineorder lines
        if (ANNOTATION_COLORS['text:lineorder'].geomEnabled) {
            angular.forEach(OPEN_ANNOTATIONS, function(thisDomain,kk) {
                // find and draw thisDomain annotations
                angular.forEach($scope.detail.annotations, function(annotation,jj) {
                    if (annotation.domain === thisDomain) {
                        ctx.beginPath();
                        ctx.moveTo(annotation.boundary[0][0],annotation.boundary[0][1]);
                        ctx.lineTo(annotation.boundary[1][0],annotation.boundary[1][1]);

                        ctx.strokeStyle = ANNOTATION_COLORS[thisDomain].thickStrokeStyle;
                        ctx.lineWidth = ANNOTATION_COLORS[thisDomain].thickLineWidth;
                        ctx.closePath();
                        ctx.stroke();

                        ctx.strokeStyle = ANNOTATION_COLORS[thisDomain].thinStrokeStyle;
                        ctx.lineWidth = ANNOTATION_COLORS[thisDomain].thinLineWidth;
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.arc(annotation.boundary[0][0],annotation.boundary[0][1], 5, 0,2*Math.PI);
                        ctx.closePath();

                        ctx.strokeStyle = ANNOTATION_COLORS[thisDomain].thinStrokeStyle;
                        ctx.fillStyle = ANNOTATION_COLORS[thisDomain].thickStrokeStyle;
                        ctx.fill();
                        ctx.stroke();
                    }
                });
            });
        }

    };

    // this is a hack
    $scope.switchToImageByLocator = function(database_name, locator) {
        console.log('[switch to image by locator] ----------------------------------------\\');
        console.log('[switch to image by locator] switching to image ' + locator);
        $scope.view_state.render_path = 'detail';
        $scope.detail.annotations = [];

        $scope.detail.image = {
            ii: 0,
            page: 1,
            max_count: 1
        };

        // load image data
        console.log('[switch to image by locator] loading image data...');
        $http.get('/api/v1/db/'+database_name+'/image/'+locator)
            .success(function(data,status,headers,config) {
                $scope.detail.image = data
                console.log('...[switch to image by locator] success.  got image data.');

                // load annotations
                console.log('...[switch to image by locator] loading annotations...');
                $http.get('/api/v1/db/'+database_name+'/image/'+locator+'/annotation')
                    .success(function(data,status,headers,config) {
                        $scope.detail.annotations = data['d']
                        console.log('......[switch to image by locator] success.  got ' + $scope.detail.annotations.length + ' annotatations');
                        console.log('......[switch to image by locator] drawing annotations');

                        drawAnnotations();
                    })
                    .error(function(data,status,headers,config) {
                        console.log('......[switch to image by locator] error');
                    });

            })
            .error(function(data,status,headers,config) {
                console.log('...[switch to image by locator] error');
            });

        console.log('[switch to image by locator] ----------------------------------------/');
    };



    $scope.switchToImage = function(ii) {
        if (ii >= 0 && ii < $scope.search_results.full_count) {
            console.log('[switch to image by ii] ----------------------------------------\\');
            console.log('[switch to image by ii] switching to image '+ii);
            $scope.view_state.render_path = 'detail';
            $scope.detail.annotations = [];

            // have we gone out of our current page?
            // which direction?
            var needToDoSearch = false;
            if (ii < $scope.search_results.images[0].ii) {
                console.log('[switch to image by ii] went below current page.  searching again');
                $scope.query.page -= 1;
                needToDoSearch = true;
            }
            if (ii > $scope.search_results.images[$scope.search_results.images.length-1].ii) {
                console.log('[switch to image by ii] went past current page.  searching again');
                $scope.query.page += 1;
                needToDoSearch = true;
            }

            if (needToDoSearch) {
                // do search in background but don't switch to thumbs view
                // wait for search to complete
                // then update detail.image
                $scope.doSearch(function() {
                    findDetailImageAndGetAnnotations(ii);
                });
            } else {
                // just update detail.image now
                findDetailImageAndGetAnnotations(ii);
            }
            console.log('[switch to image by ii] ----------------------------------------/');

        }
    };

    $scope.switchToThumbViewAndDoFirstSearchIfNeeded = function() {
        $scope.switchToThumbView();
        if (!$scope.search_results.search_has_occurred) {
            $scope.doSearch();
        }
    };
    $scope.switchToThumbView = function() {
        $scope.view_state.render_path = 'thumbs';
        // update hash
        $location.path('/'+$scope.query.database_name+'/search');
        $location.search($scope.query);
    };

    $scope.detailViewNextButtonIsEnabled = function () {
        return $scope.detail.image.ii < $scope.search_results.full_count-1;
    };
    $scope.detailViewPrevButtonIsEnabled = function () {
        return $scope.detail.image.ii >= 1;
    };

    $scope.getDetailTextAnnotations = function() {
        // just return the text annotations, not the textclusters
        var result = [];
        angular.forEach($scope.detail.annotations, function(annotation,jj) {
            if (annotation.domain === 'text:line') {
                result.push(annotation);
            }
        });
        return result;
    };

    $scope.toggleAnnotationText = function(domain) {
        ANNOTATION_COLORS[domain].textEnabled = ! ANNOTATION_COLORS[domain].textEnabled;
        drawAnnotations();
    };

    $scope.isAnnotationTextEnabled = function(domain) {
        return ANNOTATION_COLORS[domain].textEnabled;
    }

    $scope.toggleAnnotationGeom = function(domain) {
        ANNOTATION_COLORS[domain].geomEnabled = ! ANNOTATION_COLORS[domain].geomEnabled;
        drawAnnotations();
    };

    $scope.isAnnotationGeomEnabled = function(domain) {
        return ANNOTATION_COLORS[domain].geomEnabled;
    }


    //================================================================================
    // MAIN

    // fill in database_names on page load
    console.log('[main] getting database names...');
    $http.get('/api/v1/db')
        .success(function(data,status,headers,config) {
            $scope.search_form.database_names = data['d']
            console.log('...[main] success. got database names: ' + $scope.search_form.database_names);
        })
        .error(function(data,status,headers,config) {
            console.log('...[main] error');
        });


    // load data from URL
    angular.forEach($location.search(), function(value,key) {
        if (key === 'page' || key === 'max_count') {
            value = parseInt(value,10);
        }
        $scope.query[key] = value;
    });

    var path = $location.path();
    if (path.indexOf('/image/') !== -1) {
        console.log('[main] choosing DETAIL VIEW because of URL');
        // image detail view
        var parts = path.split('/');
        var locator = parts[parts.length-1];
        var database_name = parts[1];
        $scope.query.database_name = database_name;
        $scope.switchToImageByLocator(database_name, locator);
    } else {
        console.log('[main] choosing THUMB VIEW because of URL');
        // start the page off with an actual search
        $scope.switchToThumbView();
        $scope.doSearch();
    }

    /*function () {
        $scope.switchToImage(0);
    });*/

});




