"use strict";


var browseApp = angular.module('browseApp', ['ui']);


// make Angular use (( )) for template markup instead of {{ }}
//  to avoid a conflict with Flask's templates which also use {{ }}
browseApp.config(function($interpolateProvider,$locationProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
    $locationProvider.html5Mode(false);
});


browseApp.controller('BrowseController', function($scope, $http, $routeParams, $location) {

    //================================================================================
    // CONSTANTS AND UTILS

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

    $scope.TODO = function() {
        console.log('TODO');
    };

    var tokenizeString = function(s) {
        // Given a string like "   tag1 tag2 \n   tag3 "
        // Return ['tag1','tag2','tag3']
        // Assume that white space separates tokens, not commas.
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
    // REFACTOR

    //--------------------------------------------------------------------------------
    // VIEW CHOOSER

    $scope.ViewChooser = {
        view: undefined,   // 'thumbs' or 'detail'

        switchView: function(new_view,params) {
            // Shut down the current view and set up the new one by calling enter() and exit().
            // new_view should be a string like 'thumbs' or 'detail'
            // params should be a dict to be passed along to the new view.
            var current_view = $scope.ViewChooser.view;
            console.log('[ViewChooser.switchView] --------------------------------------------------------------------\\');
            console.log('[ViewChooser.switchView] starting to change view from '+current_view+' to '+new_view);
            console.log('[ViewChooser.switchView]    params = ' + JSON.stringify(params));
            // leave old view
            if (current_view === 'thumbs') { $scope.SearchAndThumbView.exit(); }
            if (current_view === 'detail') { $scope.DetailView.exit(); }
            $scope.ViewChooser.view = new_view;
            // enter new view
            if (new_view === 'thumbs') { $scope.SearchAndThumbView.enter(params); }
            if (new_view === 'detail') { $scope.DetailView.enter(params); }
            console.log('[ViewChooser.switchView] done changing from '+current_view+' to '+new_view);
            console.log('[ViewChooser.switchView] --------------------------------------------------------------------/');
        }
    };

    //--------------------------------------------------------------------------------
    // SEARCH FORM AND THUMB GRID

    $scope.SearchAndThumbView = {

        // possible values for the dropdowns
        database_name_choices: [],
        tag_choices: [],

        // state of the form elements
        has_tags_select2_settings: {
            tags: [],
            tokenSeparators: [',', ' ']
        },
        has_tags_select2_user_input: [],
        has_tags_user_input: '',

        // the query dict for doing searches
        query: {
            database_name: 'blindsight',      // TODO: this should be set to config.INITIAL_DB_NAME
            has_tags: [], // actual list
            max_count: 18,
            page: 0
        },

        // search results
        result_state: 'empty',      // empty, loading, loaded
        result_images: [],                   // results of the search
        result_full_count: 0,                // number of returned images (all pages)
        result_last_page: 0,                 // number of pages


        enter: function(params) {
            // params should be {} or {query: {...} }
            console.log('[SearchAndThumbView.enter] params = ' + JSON.stringify(params));
            // if we don't have database names yet, fetch them
            if ($scope.SearchAndThumbView.database_name_choices.length === 0) {
                $scope.SearchAndThumbView.fetchDatabaseNameChoices();
            }
            // TODO: if query is given in params, load it and launch a search maybe

            // keep URL updated
            $location.path('/'+$scope.SearchAndThumbView.query.database_name+'/search');
            // make a copy of the query object and reformat it for the REST API
            var queryForUrl = angular.copy($scope.SearchAndThumbView.query);
            delete queryForUrl.database_name;
            queryForUrl.has_tags = queryForUrl.has_tags.join(',');
            $location.search(queryForUrl);

            if ($scope.SearchAndThumbView.result_state === 'empty') {
                $scope.SearchAndThumbView.doSearch();
            }
        },
        exit: function() {
            console.log('[SearchAndThumbView.exit]');
        },

        fetchDatabaseNameChoices: function(database_name) {
            // Get the possible database names from the server and store in database_name_choices
            console.log('[SearchAndThumbView.fetchDatabaseNameChoices] getting database names...');
            $http.get('/api/v1/db')
                .success(function(data,status,headers,config) {
                    $scope.SearchAndThumbView.database_name_choices = data['d'];
                    console.log('...[SearchAndThumbView.fetchDatabaseNameChoices] success. got database names: ' + data['d']);
                })
                .error(function(data,status,headers,config) {
                    console.log('...[SearchAndThumbView.fetchDatabaseNameChoices] error');
                });
        },

        doSearch: function(callback) {
            // Send the query object off as a search.
            // When the search is done, run the callback if there is one.
            console.log('[SearchAndThumbView.doSearch] doing search...');

            $scope.SearchAndThumbView.result_state = 'loading';

            // make a copy of the query object and reformat it for the REST API
            var query = angular.copy($scope.SearchAndThumbView.query);
            query.has_tags = query.has_tags.join(',');

            // keep URL updated
            var queryForUrl = angular.copy(query);
            delete queryForUrl.database_name;
            $location.search(queryForUrl);
            $location.path('/'+$scope.SearchAndThumbView.query.database_name+'/search');

            console.log('[SearchAndThumbView.doSearch] query = ' + JSON.stringify(query));

            $http.get('/api/v1/search',{params: query})
                .success(function(data,status,headers,config) {
                    $scope.SearchAndThumbView.result_images = data['images'];
                    $scope.SearchAndThumbView.result_full_count = data['full_count'];
                    $scope.SearchAndThumbView.result_last_page = Math.floor($scope.SearchAndThumbView.result_full_count / query.max_count);
                    console.log('...[SearchAndThumbView.doSearch] success. got ' + $scope.SearchAndThumbView.result_images.length + ' images.  full_count = ' + $scope.SearchAndThumbView.result_full_count + ', last_page = ' + $scope.SearchAndThumbView.result_last_page);
                    $scope.SearchAndThumbView.result_state = 'loaded';
                    if (typeof callback !== 'undefined') {
                        console.log('...[SearchAndThumbView.doSearch] running callback:');
                        callback();
                    }
                })
                .error(function(data,status,headers,config) {
                    console.log('...[SearchAndThumbView.doSearch] error');
                });
        },

        nextButtonIsEnabled: function() {
            // Should the Next button be enabled in the thumb grid?
            return $scope.SearchAndThumbView.result_state === 'loaded' && $scope.SearchAndThumbView.query.page < $scope.SearchAndThumbView.result_last_page;
        },
        prevButtonIsEnabled: function() {
            // Should the Prev button be enabled in the thumb grid?
            return $scope.SearchAndThumbView.result_state === 'loaded' && $scope.SearchAndThumbView.query.page >= 1;
        },
        clickNextButton: function() {
            if ($scope.SearchAndThumbView.nextButtonIsEnabled()) {
                $scope.SearchAndThumbView.query.page += 1;
                $scope.SearchAndThumbView.doSearch();
            }
        },
        clickPrevButton: function() {
            if ($scope.SearchAndThumbView.prevButtonIsEnabled()) {
                $scope.SearchAndThumbView.query.page -= 1;
                $scope.SearchAndThumbView.doSearch();
            }
        },

        setHasTags: function(tags) {
            // Set has_tags to the given list of tags.
            // Affects both the search form field and the query object.
            $scope.SearchAndThumbView.has_tags_user_input = tags.join(' ');
            $scope.SearchAndThumbView.query.has_tags = tags;
        },

        clickTag: function(tag) {
            // When clicking a tag in the thumb grid, add the tag to the has_tags query.
            // Do the search again if the tag was not already in the query.
            console.log('[SearchAndThumbView.clickTag('+tag+')]');
            // if this tag is not in the query already
            if ($scope.SearchAndThumbView.query.has_tags.indexOf(tag) === -1) {
                // add the tag to the has_tags form
                var existing_tags = $scope.SearchAndThumbView.query.has_tags;
                existing_tags.push(tag)
                $scope.SearchAndThumbView.setHasTags( existing_tags );

                // and refresh the search
                $scope.SearchAndThumbView.query.page = 0;
                $scope.SearchAndThumbView.doSearch();
            }
        },

        clickSearchButton: function() {
            // Set the page to 0 and initate a search.
            $scope.SearchAndThumbView.query.page = 0;
            $scope.SearchAndThumbView.doSearch();
        },
        clickClearButton: function() {
            // Set has_tags to [], page to 0, and do the search again.
            $scope.SearchAndThumbView.setHasTags( [] );
            $scope.SearchAndThumbView.query.page = 0;
            $scope.SearchAndThumbView.doSearch();
        },

        switchToImage: function(id) {
            // The template calls this function when the user clicks on a thumbnail
            console.log('[SearchAndThumbView.switchToImage('+id+')]');
            $scope.ViewChooser.switchView('detail',{
                database_name: $scope.SearchAndThumbView.query.database_name,
                image_id: id,
            });
        },

    };

    // when the db name changes, fetch tags for that db
    $scope.$watch('SearchAndThumbView.query.database_name', function(newValue,oldValue) {
        console.log('[SearchAndThumbView watch query.database_name] getting tags for '+newValue+'...');
        $http.get('/api/v1/db/'+$scope.SearchAndThumbView.query.database_name+'/tag')
            .success(function(data,status,headers,config) {
                $scope.SearchAndThumbView.tag_choices = data['d'];
                // TODO: push into select2 also
                console.log('...[SearchAndThumbView watch query.database_name] got ' + data['d'].length + ' tags');
            })
            .error(function(data,status,headers,config) {
                console.log('...[SearchAndThumbView watch query.database_name] error getting tags');
            });
    });

    // keep the query up to date as the form changes
    $scope.$watch('SearchAndThumbView.has_tags_user_input', function(newValue,oldValue) {
        // convert space-separated tags to comma-separated for the API
        $scope.SearchAndThumbView.query.has_tags = tokenizeString($scope.SearchAndThumbView.has_tags_user_input);
    });


    //--------------------------------------------------------------------------------
    // DETAIL

    $scope.DetailView = {

        // what to fetch
        image_id: undefined,
        database_name: undefined,

        // fetched data
        image: {},
        annotations: [],

        // view state
        showText: {
            'text:char': true,
            'text:word': true,
            'text:line': true,
        },
        showGeom: {
            'text:char': true,
            'text:word': true,
            'text:line': true,
            'text:lineorder': true,
        },


        enter: function(params) {
            // params should be {database_name: 'rigor', image_id: 2423}
            console.log('[DetailView.enter] params = ' + JSON.stringify(params));
            $scope.DetailView.image_id = params.image_id;
            $scope.DetailView.database_name = params.database_name;
            $scope.DetailView.fetchImageDataAndAnnotations();

            // keep URL updated
            $location.path('/'+$scope.DetailView.database_name+'/image/'+$scope.DetailView.image_id);
            $location.search('');

        },
        exit: function() {
            console.log('[DetailView.exit]');
        },

        fetchImageDataAndAnnotations: function() {
            // With image_id and database_name already set,
            // find the image json data (either from the SearchAndThumbView
            // or from the server) and save it in DetailView.image
            // Then get the annotations.

            $scope.DetailView.image = undefined;
            $scope.DetailView.annotations = [];

            // first, check if SearchAndThumbView has it
            if ($scope.SearchAndThumbView.result_state === 'loaded') {
                angular.forEach($scope.SearchAndThumbView.result_images, function(image,ii) {
                    if (image.id === $scope.DetailView.image_id) {
                        console.log('[DetailView.fetchImageAndAnnotations] found image in SearchAndThumbView');
                        $scope.DetailView.image = image;
                        $scope.DetailView._fetchAnnotations(); 
                        return;
                    }
                });
            }
            // if not, AJAX
            if ($scope.DetailView.image === undefined) {
                console.log('[DetailView.fetchImageAndAnnotations] fetching image details from server...');
                $http.get('/api/v1/db/'+$scope.DetailView.database_name+'/image/'+$scope.DetailView.image_id)
                    .success(function(data,status,headers,config) {
                        console.log('...[DetailView.fetchImageAndAnnotations] success');
                        $scope.DetailView.image = data
                        $scope.DetailView._fetchAnnotations(); 
                    })
                    .error(function(data,status,headers,config) {
                        console.log('...[DetailView.fetchImageAndAnnotations] error');
                    });
            }
        },

        _fetchAnnotations: function() {
            // Grab the annotations from the server and store in DetailView.annotations
            console.log('[DetailView.fetchAnnotations] fetching annotations from server...');
            $http.get('/api/v1/db/'+$scope.DetailView.database_name+'/image/'+$scope.DetailView.image_id+'/annotation')
                .success(function(data,status,headers,config) {
                    $scope.DetailView.annotations = data['d']
                    $scope.DetailView.drawAnnotations();
                    console.log('...[DetailView.fetchAnnotations] success.  got ' + data['d'].length + ' annotations.');
                })
                .error(function(data,status,headers,config) {
                    console.log('...[DetailView.fetchAnnotations] error');
                });
        },

        drawAnnotations: function() {
            console.log('[DetailView.drawAnnotations]');
            var canvas = document.getElementById('image_canvas');
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,$scope.DetailView.image.x_resolution, $scope.DetailView.image.y_resolution);

            angular.forEach(FILLED_ANNOTATIONS, function(thisDomain,kk) {
                // find and draw thisDomain annotations
                if ($scope.DetailView.showGeom[thisDomain]) {
                    angular.forEach($scope.DetailView.annotations, function(annotation,jj) {
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
                if ($scope.DetailView.showText[thisDomain]) {
                    angular.forEach($scope.DetailView.annotations, function(annotation,jj) {
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
            if ($scope.DetailView.showGeom['text:lineorder']) {
                angular.forEach(OPEN_ANNOTATIONS, function(thisDomain,kk) {
                    // find and draw thisDomain annotations
                    angular.forEach($scope.DetailView.annotations, function(annotation,jj) {
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

        }, // end drawAnnotations()

        nextButtonIsEnabled: function() {
            if ($scope.SearchAndThumbView.result_state !== 'loaded') {
                return false;
            }
            return $scope.DetailView.image.ii < $scope.SearchAndThumbView.result_full_count - 1;
        },
        prevButtonIsEnabled: function() {
            if ($scope.SearchAndThumbView.result_state !== 'loaded') {
                return false;
            }
            return $scope.DetailView.image.ii > 0;
        },

        _findNextOrPrevId: function(offset,callback) {
            // Finds the id of the image with ii equal to current image's ii + offset.
            // If needed, changes the search results page and does a new search in the background.
            // Calls callback(id) when done.
            // offset should be 1 or -1.

            var new_ii = $scope.DetailView.image.ii + offset;
            console.log('[DetailView._findNextOrPrevId] looking for the id of image with ii = ' + new_ii);

            // find min and max ii of existing search results
            var min_ii = $scope.SearchAndThumbView.result_images[0].ii;
            var max_ii = $scope.SearchAndThumbView.result_images[$scope.SearchAndThumbView.result_images.length-1].ii;

            // went past the beginning of the search results
            if (new_ii < min_ii) {
                console.log('[DetailView._findNextOrPrevId] looking at the previous page and doing a new search...');
                $scope.SearchAndThumbView.query.page -= 1;
                $scope.SearchAndThumbView.doSearch(function() {
                    // after search is done, return the id of the last result
                    var new_id = $scope.SearchAndThumbView.result_images[$scope.SearchAndThumbView.result_images.length-1].id;
                    console.log('...[DetailView._findNextOrPrevId] search is done.  new id = ' + new_id);
                    callback(new_id);
                });
                return;
            }

            // went past the end of the search results
            if (new_ii > max_ii) {
                console.log('[DetailView._findNextOrPrevId] looking at the next page and doing a new search...');
                $scope.SearchAndThumbView.query.page += 1;
                $scope.SearchAndThumbView.doSearch(function() {
                    // after search is done, return the id of the first result
                    var new_id = $scope.SearchAndThumbView.result_images[0].id;
                    console.log('...[DetailView._findNextOrPrevId] search is done.  new id = ' + new_id);
                    callback(new_id);
                });
                return;
            }

            // the ii we want is in the existing search results.  find it there
            var new_id = undefined;
            angular.forEach($scope.SearchAndThumbView.result_images, function(img,jj) {
                if (img.ii == new_ii) {
                    console.log('[DetailView._findNextOrPrevId] new id found in existing search results: '+new_id);
                    callback(img.id);
                }
            });

            return new_id;
        },
        clickNextButton: function() {
            // Get the id of the next image and switch to it.
            if ($scope.DetailView.nextButtonIsEnabled()) {
                console.log('[DetailView.clickNextButton] getting next id...');
                $scope.DetailView._findNextOrPrevId(1,function(new_id) {
                    if (typeof new_id === 'undefined') { return; }
                    // update view
                    console.log('...[DetailView.clickNextButton] switching to next id '+new_id);
                    $scope.ViewChooser.switchView('detail',{
                        database_name: $scope.DetailView.database_name,
                        image_id: new_id
                    });
                });
            }
        },
        clickPrevButton: function() {
            // Get the id of the prev image and switch to it.
            if ($scope.DetailView.prevButtonIsEnabled()) {
                console.log('[DetailView.clickPrevButton] getting prev id...');
                $scope.DetailView._findNextOrPrevId(-1,function(new_id) {
                    if (typeof new_id === 'undefined') { return; }
                    // update view
                    console.log('...[DetailView.clickPrevButton] switching to prev id '+new_id);
                    $scope.ViewChooser.switchView('detail',{
                        database_name: $scope.DetailView.database_name,
                        image_id: new_id
                    });
                });
            }
        },

        toggleAnnotationText: function(domain) {
            $scope.DetailView.showText[domain] = ! $scope.DetailView.showText[domain];
            $scope.DetailView.drawAnnotations();
        },
        toggleAnnotationGeom: function(domain) {
            $scope.DetailView.showGeom[domain] = ! $scope.DetailView.showGeom[domain];
            $scope.DetailView.drawAnnotations();
        },

    };

    //--------------------------------------------------------------------------------
    // MAIN

    console.log('[main] --------------------------------------------------------------\\');

    // depending on URL, switch to appropriate view
    var path = $location.path();
    console.log('[main] path = ' + path);

    if (path.indexOf('/image/') !== -1) {
        console.log('[main] choosing DETAIL VIEW because of URL');

        var parts = path.split('/');
        var image_id = parts[parts.length-1];
        var database_name = parts[1];

        $scope.ViewChooser.switchView('detail',{
            database_name: database_name,
            image_id: image_id
        });

    } else {
        console.log('[main] choosing SEARCH AND THUMB VIEW because of URL');

        // get database name from URL
        var parts = path.split('/');
        var database_name = 'blindsight';
        if (parts.length >= 2) {
            database_name = parts[1];
        }
        $scope.SearchAndThumbView.query.database_name = database_name;

        // get query from URL
        angular.forEach($location.search(), function(value,key) {
            if (key === 'page' || key === 'max_count') {
                value = parseInt(value,10);
            }
            if (key === 'has_tags') {
                // convert from comma-separated string to actual list object
                value = value.split(',');
                $scope.SearchAndThumbView.setHasTags(value);
            }
            $scope.SearchAndThumbView.query[key] = value;
        });

        console.log('[main] query = '+JSON.stringify($scope.SearchAndThumbView.query));

        $scope.ViewChooser.switchView('thumbs',{});
    }

    console.log('[main] --------------------------------------------------------------/');


});




