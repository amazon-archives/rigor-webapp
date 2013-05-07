"use strict";


var browseApp = angular.module('browseApp', []);


// make Angular use (( )) for template markup instead of {{ }}
// to avoid a conflict with Flask's templates which also use {{ }}
browseApp.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
});


browseApp.controller('BrowseController', function($scope, $http, $routeParams, $location) {

    //================================================================================
    // CONSTANTS AND UTILS

    // ANY is a special value to represent that we should ignore this field
    // when searching.  this is equivalent to ''.
    // When we convert $scope.query to query params for the API, we
    // omit any items which are ANY or ''.
    var ANY = '(any)';

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
    // SCOPES

    $scope.view_state = {            // which view mode we're in.
        render_path: 'thumbs'        // 'thumbs', 'detail'
    };
    $scope.search_form = {           // choices for drop-downs.  to be filled in via AJAX
        database_names: ['rigor'],
        sources: [],
        sensors: []
    };
    $scope.query = {                 // query params for searching images
        database_name: 'rigor',      // TODO: this should be set to config.INITIAL_DB_NAME
        source: ANY,
        sensor: ANY,
        has_tags: '',
        exclude_tags: '',
        max_count: 9,
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
        ii: undefined,                // we are viewing image # 203 out of the search results
    };


    //================================================================================
    // SEARCH FORM BUTTONS AND BEHAVIOR

    $scope.clickClearButton = function() {
        $scope.query.source = ANY;
        $scope.query.sensor = ANY;
        $scope.query.has_tags = '';
        $scope.query.exclude_tags = '';
        $scope.query.page = 0;
        $scope.doSearch();
    };

    $scope.clickSearchButton = function() {
        $scope.query.page = 0;
        $scope.doSearch();
    };

    // when user changes database name, re-fetch sources and sensors
    $scope.$watch('query.database_name', function(newValue,oldValue) {
        console.log('db name changed from ' + oldValue + ' to ' + newValue);

        // fill in sources
        console.log('getting sources...');
        $http.get('/api/v1/db/'+$scope.query.database_name+'/source')
            .success(function(data,status,headers,config) {
                $scope.search_form.sources = data['d'];
                $scope.search_form.sources.unshift(ANY);  // put on front of list
                console.log($scope.search_form.sources);
                console.log('    success. got sources: ' + $scope.search_form.sources);
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });

        // fill in sensors
        console.log('getting sensors...');
        $http.get('/api/v1/db/'+$scope.query.database_name+'/sensor')
            .success(function(data,status,headers,config) {
                $scope.search_form.sensors = data['d'];
                $scope.search_form.sensors.unshift(ANY);  // put on front of list
                console.log($scope.search_form.sensors);
                console.log('    success. got sensors: ' + $scope.search_form.sensors);
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });

        // // update hash
        // $location.path('/'+$scope.query.database_name+'/browse');
        
        // TODO: set query.source and query.sensor to legal values

    });


    //================================================================================
    // DO SEARCH

    $scope.doSearch = function() {
        $scope.view_state.render_path = 'thumbs';
        console.log('getting images...');

        $scope.search_results.search_has_occurred = true;

        //$location.search('source='+$scope.query.source);

        // clean up query object for use as URL params
        var queryParams = angular.copy($scope.query);
        queryParams.has_tags = tokenizeString(queryParams.has_tags).join();
        queryParams.exclude_tags = tokenizeString(queryParams.exclude_tags).join();

        angular.forEach(queryParams, function(value,key) {
            if (value === ANY || value === '') {
                delete queryParams[key];
            }
        });
        console.log(queryParams);

        $http.get('/api/v1/search',{params: queryParams})
            .success(function(data,status,headers,config) {
                $scope.search_results.images = data['images'];
                $scope.search_results.full_count = data['full_count'];
                $scope.search_results.last_page = Math.floor($scope.search_results.full_count / $scope.query.max_count);
                console.log('    success. got ' + $scope.search_results.images.length + ' images');
                console.log('    full_count = ' + $scope.search_results.full_count);
                console.log('    last_page = ' + $scope.search_results.last_page);
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });
    };


    //================================================================================
    // THUMB PAGINATION

    $scope.nextButtonIsEnabled = function () {
        return $scope.search_results.search_has_occurred && $scope.query.page < $scope.search_results.last_page;
    };
    $scope.prevButtonIsEnabled = function () {
        return $scope.search_results.search_has_occurred && $scope.query.page >= 1;
    };

    $scope.clickNextButton = function() {
        if ($scope.nextButtonIsEnabled()) {
            console.log('next button');
            $scope.query.page += 1;
            $scope.doSearch();
        }
    };
    $scope.clickPrevButton = function() {
        if ($scope.prevButtonIsEnabled()) {
            console.log('prev button');
            $scope.query.page -= 1;
            $scope.doSearch();
        }
    };


    //================================================================================
    // MODIFY SEARCH BY CLICKING TAG IN DETAIL OR THUMB VIEW

    $scope.clickTag = function(tag) {
        var existingTagSearch = tokenizeString($scope.query.has_tags);
        // if we're not already searching for this tags...
        if (existingTagSearch.indexOf(tag) === -1) {
            // add the tag to the has_tags string
            if ($scope.query.has_tags === '') {
                $scope.query.has_tags = tag;
            } else {
                $scope.query.has_tags += ' ' + tag;
            }
            $scope.doSearch();
        }
    };


    //================================================================================
    // SWITCH INTO DETAIL VIEW

    $scope.clickImage = function(locator) {
        console.log('clicked image: ' + locator);
        $scope.view_state.render_path = 'detail';

        // try to grab the image details from the list of search results
        $scope.detail.image = undefined;
        $scope.detail.ii = undefined;
        angular.forEach($scope.search_results.images, function(image,ii) {
            if (image.locator === locator) {
                $scope.detail.image = image;
                $scope.detail.ii = ii;
                console.log('found image');
            }
        });
        if (typeof $scope.detail.image === 'undefined') {
            console.error('could not find image');
        }
        //    if ($scope.detail.image === null) {
        //        console.log('image is not in search results.  fetching image details...');
        //        $http.get('/api/v1/db/'+$scope.query.database_name+'/image/'+$scope.detail.locator)
        //            .success(function(data,status,headers,config) {
        //                $scope.detail.image = data;
        //                console.log('    success. got image details: ' + $scope.search_form.database_names);
        //            })
        //            .error(function(data,status,headers,config) {
        //                console.log('    error');
        //            });
        //    }
        //});
    }


    //================================================================================
    // DETAIL VIEW PAGINATION

    $scope.switchToImage = function(ii) {
        if (ii >= 0 && ii < $scope.search_results.full_count) {
            console.log('switching to image '+ii);
            $scope.detail.ii = ii;
            $scope.detail.image = $scope.search_results.images[ii];
        }
    };

    $scope.switchToThumbView = function() {
        $scope.view_state.render_path = 'thumbs';
    };

    $scope.nextImageButtonIsEnabled = function () {
        return $scope.detail.ii < $scope.search_results.full_count-1;
    };
    $scope.prevImageButtonIsEnabled = function () {
        return $scope.detail.ii >= 1;
    };


    //================================================================================
    // MAIN

    // fill in database_names on page load
    console.log('getting database names...');
    $http.get('/api/v1/db')
        .success(function(data,status,headers,config) {
            $scope.search_form.database_names = data['d']
            console.log($scope.search_form.database_names)
            console.log('    success. got database names: ' + $scope.search_form.database_names);
        })
        .error(function(data,status,headers,config) {
            console.log('    error');
        });


    // start the page off with an actual search
    $scope.doSearch();

});




