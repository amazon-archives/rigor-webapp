"use strict";



var browseApp = angular.module('browseApp', []);

// make Angular use (( )) for template markup instead of {{ }}
// to avoid a conflict with Flask's templates which also use {{ }}
browseApp.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('((');
    $interpolateProvider.endSymbol('))');
});

browseApp.controller('BrowseController', function($scope, $http) {
    $scope.images = [];
    $scope.database_names = ['rigor']; // this will be populated via AJAX in a moment
    $scope.filter = {
        database_name: 'rigor',
        source: '',
        sensor: '',
        has_tags: 'sign sightpal',
        exclude_tags: ''
    };

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


    $scope.applyFilter = function () {
        console.log('getting images...');

        // clean up filter object for use as URL params
        var filterParams = angular.copy($scope.filter);
        filterParams.has_tags = tokenizeString(filterParams.has_tags).join();
        filterParams.exclude_tags = tokenizeString(filterParams.exclude_tags).join();
        // delete keys which have empty strings as values
        angular.forEach(filterParams, function(value,key) {
            if (value === '') {
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


});




