"use strict";



var browseApp = angular.module('browseApp', []);

// make Angular use (( )) for template markup instead of {{ }}
// to avoid a conflict with Flask's templates which also use {{ }}
browseApp.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
});

browseApp.controller('BrowseController', function($scope, $http) {

    // ANY is a special value to represent that we should ignore this field
    // when searching.  this is equivalent to ''.
    // When we convert $scope.query to query params for the API, we
    // omit any items which are ANY or ''.
    var ANY = '(any)';

    $scope.database_names = ['rigor']; // to be filled in by AJAX
    $scope.sources = [];               // to be filled in by AJAX
    $scope.sensors = [];               // to be filled in by AJAX
    $scope.search_has_occurred = false;
    $scope.query = {                  // query params for searching images
        database_name: 'rigor',  // TODO: this should be set to config.INITIAL_DB_NAME
        source: ANY,
        sensor: ANY,
        has_tags: 'sign sightpal',
        exclude_tags: '',
        page: 0
    };
    $scope.images = [];                // results of the search

    // fill in database_names
    console.log('getting database names...');
    $http.get('/api/v1/db')
        .success(function(data,status,headers,config) {
            $scope.database_names = data['d']
            console.log($scope.database_names)
            console.log('    success. got database names: ' + $scope.database_names);
        })
        .error(function(data,status,headers,config) {
            console.log('    error');
        });

    // when user changes database name, re-fetch sources and sensors
    $scope.$watch('query.database_name', function(newValue,oldValue) {
        console.log('db name changed from ' + oldValue + ' to ' + newValue);

        // fill in sources
        console.log('getting sources...');
        $http.get('/api/v1/db/'+$scope.query.database_name+'/source')
            .success(function(data,status,headers,config) {
                $scope.sources = data['d'];
                $scope.sources.unshift(ANY);  // put on front of list
                console.log($scope.sources);
                console.log('    success. got sources: ' + $scope.sources);
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });

        // fill in sensors
        console.log('getting sensors...');
        $http.get('/api/v1/db/'+$scope.query.database_name+'/sensor')
            .success(function(data,status,headers,config) {
                $scope.sensors = data['d'];
                $scope.sensors.unshift(ANY);  // put on front of list
                console.log($scope.sensors);
                console.log('    success. got sensors: ' + $scope.sensors);
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });
        
        // TODO: set query.source and query.sensor to legal values

    });


    var tokenizeString = function(s) {
        // given a string like "   tag1 tag2    tag3 "
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


    $scope.searchButtonClick = function() {
        $scope.query.page = 0;
        $scope.doSearch();
    };
    $scope.doSearch = function() {
        console.log('getting images...');

        $scope.search_has_occurred = true;

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
                $scope.images = data['d'];
                console.log('    success. got ' + $scope.images.length + ' images');
                //// convert timestamps from seconds to milliseconds
                //for (var ii in $scope.entries) {
                //    $scope.entries[ii].timestamp *= 1000;
                //}
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });
    };


    $scope.nextButtonIsEnabled = function () {
        return $scope.search_has_occurred;
    };
    $scope.prevButtonIsEnabled = function () {
        return $scope.search_has_occurred && $scope.query.page >= 1;
    };

    $scope.nextButtonClick = function() {
        if ($scope.nextButtonIsEnabled()) {
            console.log('next button');
            $scope.query.page += 1;
            $scope.doSearch();
        }
    };
    $scope.prevButtonClick = function() {
        if ($scope.prevButtonIsEnabled()) {
            console.log('prev button');
            $scope.query.page -= 1;
            $scope.doSearch();
        }
    };


});




