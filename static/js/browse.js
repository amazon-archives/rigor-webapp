"use strict";



var browseApp = angular.module('browseApp', []);

// make Angular use (( )) for template markup instead of {{ }}
// to avoid a conflict with Flask's templates which also use {{ }}
browseApp.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
});

browseApp.controller('BrowseController', function($scope, $http) {

    // A special value to represent that we should ignore this field
    // when filtering.  this is equivalent to ''.
    // When we convert $scope.filter to query params for the API, we
    // omit any items which are ANY or ''.
    var ANY = '(any)';

    $scope.database_names = ['rigor']; // to be filled in by AJAX
    $scope.sources = [];               // to be filled in by AJAX
    $scope.sensors = [];               // to be filled in by AJAX
    $scope.search_has_occurred = false;
    $scope.filter = {                  // query params for filtering images
        database_name: 'rigor',  // TODO: this should be set to config.INITIAL_DB_NAME
        source: ANY,
        sensor: ANY,
        has_tags: 'sign sightpal',
        exclude_tags: '',
        page: 0
    };
    $scope.images = [];                // results of the filtering

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

    // fill in sources
    console.log('getting sources...');
    $http.get('/api/v1/db/'+$scope.filter.database_name+'/source')
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
    $http.get('/api/v1/db/'+$scope.filter.database_name+'/sensor')
        .success(function(data,status,headers,config) {
            $scope.sensors = data['d'];
            $scope.sensors.unshift(ANY);  // put on front of list
            console.log($scope.sensors);
            console.log('    success. got sensors: ' + $scope.sensors);
        })
        .error(function(data,status,headers,config) {
            console.log('    error');
        });

    // TODO: when user changes database name, re-fetch sources and sensors


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


    $scope.applyFilterAndResetPage = function() {
        $scope.filter.page = 0;
        $scope.applyFilter();
    };
    $scope.applyFilter = function() {
        console.log('getting images...');

        $scope.search_has_occurred = true;

        // clean up filter object for use as URL params
        var filterParams = angular.copy($scope.filter);
        filterParams.has_tags = tokenizeString(filterParams.has_tags).join();
        filterParams.exclude_tags = tokenizeString(filterParams.exclude_tags).join();

        angular.forEach(filterParams, function(value,key) {
            if (value === ANY || value === '') {
                delete filterParams[key];
            }
        });
        console.log(filterParams);

        $http.get('/api/v1/search',{params: filterParams})
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


    $scope.nextButton = function() {
        if ($scope.search_has_occurred) {
            console.log('next button');
            $scope.filter.page += 1;
            $scope.applyFilter();
        }
    };

    $scope.prevButton = function() {
        if ($scope.search_has_occurred && $scope.filter.page >= 1) {
            console.log('prev button');
            $scope.filter.page -= 1;
            $scope.applyFilter();
        }
    };


});




