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


    var copyOverList = function(sourceList,targetList) {
        // Replace the contents of targetList with the contents of sourceList
        // but preserve the actual list object of targetList

        //console.log()
        //console.log('COPY OVER LIST');
        //console.log('   old list = ' + JSON.stringify(targetList));
        //console.log('   new list = ' + JSON.stringify(sourceList));
        while (targetList.length > 0) {targetList.pop();}
        angular.forEach(sourceList, function(item,ii) {
            targetList.push(item);
        });
        //console.log('   ---');
        //console.log('   old list = ' + JSON.stringify(targetList));
        //console.log('   new list = ' + JSON.stringify(sourceList));
        //console.log()
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
            tags: [], // tag choices
            tokenSeparators: [',', ' '],
            //query: function(query) {
            //    console.log('query <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
            //    var results = [
            //        { id: 'hello', text: 'hello'},
            //        { id: 'there', text: 'there'},
            //    ];
            //    query.callback({results: results});
            //},
            //createSearchChoice: function(term) {
            //    return { id: term, text: term};
            //}
        },
        has_tags_select2_user_input: [],

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

        setHasTags: function(tags,pageLoading) {
            // Set has_tags to the given list of tags.
            // Affects both the search form field and the query object.

            console.log('');
            console.log('/////////////////// setHasTags, pageLoading = ' + pageLoading);
            console.log('tags = ' + JSON.stringify(tags));

            $scope.SearchAndThumbView.query.has_tags = tags;

            console.log('query.has_tags = ' + JSON.stringify($scope.SearchAndThumbView.query.has_tags));

            var newTags = [];
            if (tags.length === 1 && tags[0] === "") {
                // pass
            } else {
                angular.forEach(tags, function(tag,ii) {
                    // TODO: how to know if we should add objects or strings here?
                    // select2 sometimes wants one kind and sometimes the other.
                    if (pageLoading) {
                        newTags.push(tag);
                    } else {
                        newTags.push({
                            id: tag,
                            text: tag
                        });
                    }
                });
            }
            $scope.SearchAndThumbView.has_tags_select2_user_input = newTags;

            console.log('select2_user_input = ' + JSON.stringify($scope.SearchAndThumbView.has_tags_select2_user_input));
            console.log('///////////////////');
            console.log('');

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
                $scope.SearchAndThumbView.setHasTags( existing_tags, false );

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
            $scope.SearchAndThumbView.setHasTags( [], false );
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
                // update tag choices
                $scope.SearchAndThumbView.tag_choices = data['d'];
                copyOverList(
                    data['d'],
                    $scope.SearchAndThumbView.has_tags_select2_settings.tags
                );
                if (newValue !== oldValue) {
                    $scope.SearchAndThumbView.setHasTags([], false);
                }
                console.log('...[SearchAndThumbView watch query.database_name] got ' + data['d'].length + ' tags');
            })
            .error(function(data,status,headers,config) {
                console.log('...[SearchAndThumbView watch query.database_name] error getting tags');
            });
    });

    // keep the query up to date as the form changes
    $scope.$watch('SearchAndThumbView.has_tags_select2_user_input', function(newValue,oldValue) {
        // convert select2 tag objects to a simple list of tags
        var tags = [];
        angular.forEach($scope.SearchAndThumbView.has_tags_select2_user_input, function(tagObject,ii) {
            tags.push(tagObject.text);
        });
        $scope.SearchAndThumbView.query.has_tags = tags;
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
        /*
        an annotation looks like {
            boundary: [ [x,y], [x,y], [x,y], [x,y] ]
            confidence: 0
            domain: "text:word"
            id: 59284
            image_id: 29484
            model: "Hello"
            stamp: 1369204150
            _edit_state: "unchanged"  // is added here in the browser, not from the backend.  unchanged, edited, deleted, new
        }
        */

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

        // selected annotation: will be one of the objects from annotations list
        selected_annotation: null,
        annotation_has_just_been_changed: false,

        // should the save button be enabled?
        can_save: false,
        save_state: 'nothing', // nothing, can_save, saving, error

        // comparison
        //comparison_boxes_string: '[((12, 264), (12, 221), (137, 221), (137, 264)), ((139, 364), (139, 175), (534, 175), (534, 364))]',
        comparison_boxes_string: '',
        comparison_boxes: [],  // a list of annotation-style objects like:
        /*
           boundary: [ [] [] [] [] ],
           color: "#f90",
        */

        enter: function(params) {
            // params should be {database_name: 'rigor', image_id: 2423}
            console.log('[DetailView.enter] params = ' + JSON.stringify(params));
            $scope.DetailView.image_id = params.image_id;
            $scope.DetailView.database_name = params.database_name;
            $scope.DetailView.fetchImageDataAndAnnotations();

            // clear annotation selection and save button state
            $scope.DetailView.selected_annotation = null;
            $scope.DetailView.can_save = false;
            $scope.DetailView.save_state = 'nothing';

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
                    console.log('...[DetailView.fetchAnnotations] success.  got ' + data['d'].length + ' annotations.');
                    // set _edit_state for all the annotations because the server doesn't set it for us
                    angular.forEach($scope.DetailView.annotations, function(annotation,ii) {
                        annotation._edit_state = 'unchanged';
                    });
                    $scope.DetailView.drawAnnotations();
                })
                .error(function(data,status,headers,config) {
                    console.log('...[DetailView.fetchAnnotations] error');
                });
        },


        getAnnotationsByDomain: function(domain) {
            var result = [];
            angular.forEach($scope.DetailView.annotations, function(annotation,ii) {
                if (annotation.domain === domain) {
                    result.push(annotation);
                }
            });
            return result;
        },

        annotationToSvgPoints: function(annotation) {
            var result = '';
            angular.forEach(annotation.boundary, function(point,ii) {
                result = result + point[0] + ',' + point[1] + ' ';
            });
            return result;
        },

        drawAnnotations: function() {
            return; // hack
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

        isSelectedAnnotation: function(annotation) {
            if ($scope.DetailView.selected_annotation) {
                return annotation.id === $scope.DetailView.selected_annotation.id;
            } else {
                return false;
            }
        },

        clickAnnotation: function(annotation) {
            $scope.DetailView.selected_annotation = annotation;
            $scope.DetailView.annotation_has_just_been_changed = true;
            // fetch annotation tags if needed
            if (! $scope.DetailView.selected_annotation.hasOwnProperty('tags')) {
                console.log('[DetailView.clickAnnotation] fetching annotation tags');
                $http.get('/api/v1/db/'+$scope.DetailView.database_name+'/image/'+$scope.DetailView.image_id+'/annotation/'+annotation.id+'/tag')
                    .success(function(data,status,headers,config) {
                        console.log('...[DetailView.clickAnnotation] success');
                        if (data['d'].length > 0) {
                            $scope.DetailView.selected_annotation.tags = data['d'];
                        }
                    })
                    .error(function(data,status,headers,config) {
                        console.log('...[DetailView.clickAnnotation] error');
                    });
            }
            setTimeout(function() {
                document.getElementById('model-form').focus();
            }, 10);
        },

        toggleAnnotationText: function(domain) {
            $scope.DetailView.showText[domain] = ! $scope.DetailView.showText[domain];
            $scope.DetailView.drawAnnotations();
        },
        toggleAnnotationGeom: function(domain) {
            $scope.DetailView.showGeom[domain] = ! $scope.DetailView.showGeom[domain];
            $scope.DetailView.drawAnnotations();
        },

        clickDelete: function() {
            console.log('[DetailView.clickDelete]');

            // mark for deletion
            // this also hides it from the SVG view
            $scope.DetailView.selected_annotation._edit_state = 'deleted';

            // deselect the thing we deleted
            $scope.DetailView.selected_annotation = null;

            // enable save button
            $scope.DetailView.can_save = true;
            $scope.DetailView.save_state = 'can_save';
        },

        clickSaveAllChanges: function() {
            console.log('[DetailView.clickSaveAllChanges]');
            // set button state to pending
            $scope.DetailView.save_state = 'saving';

            // make a list of all annotations that have changed
            var annotations_to_save = [];
            angular.forEach($scope.DetailView.annotations, function(annotation,ii) {
                if (annotation._edit_state !== 'unchanged') {
                    annotations_to_save.push(annotation);
                }
            });
            console.log('[DetailView.saveAllChanges] found ' + annotations_to_save.length + ' annotations to save');

            // send changes up to server
            var js = JSON.stringify({'annotations': annotations_to_save});
            $http.post('/api/v1/db/'+$scope.DetailView.database_name+'/save_annotations', js)
                .success(function(data,status,headers,config) {
                    console.log('...[DetailView.saveAllChanges] success');
                    // reset save button
                    $scope.DetailView.save_state = 'nothing';
                    // remove deleted annotations
                    // we have to loop backward from the end of the array so we can delete as we go
                    for (var ii = $scope.DetailView.annotations.length - 1; ii >= 0; ii--) {
                        var annotation = $scope.DetailView.annotations[ii];
                        if (annotation._edit_state == 'deleted') {
                            $scope.DetailView.annotations.splice(ii,1); // remove element ii
                        }
                    }
                    // mark all remaining annotations as unchanged
                    angular.forEach($scope.DetailView.annotations, function(annotation,ii) {
                        console.log('   ' + annotation.id + ' ' + annotation._edit_state);
                        annotation._edit_state = 'unchanged';
                    });
                })
                .error(function(data,status,headers,config) {
                    console.log('...[DetailView.saveAllChanges] error');
                    $scope.DetailView.save_state = 'error';
                });
        },

    };

    // keep track of changes to annotation fields
    $scope.$watch('DetailView.selected_annotation.model', function(newValue,oldValue) {
        if ($scope.DetailView.annotation_has_just_been_changed) {
            $scope.DetailView.annotation_has_just_been_changed = false;
            return;
        }
        if (oldValue === null) {return;}
        if (newValue === null) {return;}
        $scope.DetailView.selected_annotation._edit_state = 'edited';
        $scope.DetailView.can_save = true;
        $scope.DetailView.save_state = 'can_save';
    });

    $scope.$watch('DetailView.selected_annotation.confidence', function(newValue,oldValue) {
        if ($scope.DetailView.annotation_has_just_been_changed) {
            $scope.DetailView.annotation_has_just_been_changed = false;
            return;
        }
        if (oldValue === null) {return;}
        if (newValue === null) {return;}
        $scope.DetailView.selected_annotation._edit_state = 'edited';
        $scope.DetailView.can_save = true;
        $scope.DetailView.save_state = 'can_save';
    });

    $scope.$watch('DetailView.comparison_boxes_string', function(newValue,oldValue) {
        var input_boxes = JSON.parse(newValue.replace(/\(/g, '[').replace(/\)/g, ']'));
        $scope.DetailView.comparison_boxes = [];
        for (var ii = 0; ii < input_boxes.length; ii++) {
            // todo later: do an ajax here to python backend to get real colors from comparison
            var output_box = {
                boundary: input_boxes[ii],
                fill: "hsla(300,100%,45%,0.25)",
                stroke: "hsla(300,100%,80%,0.8)",
            }
            $scope.DetailView.comparison_boxes.push(output_box);
        }
    });

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
                $scope.SearchAndThumbView.setHasTags(value, true);
            }
            $scope.SearchAndThumbView.query[key] = value;
        });

        console.log('[main] query = '+JSON.stringify($scope.SearchAndThumbView.query));

        $scope.ViewChooser.switchView('thumbs',{});
    }

    console.log('[main] --------------------------------------------------------------/');


});




