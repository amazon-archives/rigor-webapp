"use strict";

// entry:
//      text
//      id   // ignore
//      timestamp
//      uuid

var dashApp = angular.module('dashApp', []);

dashApp.config(function($interpolateProvider) {
        $interpolateProvider.startSymbol('((');
        $interpolateProvider.endSymbol('))');
});

dashApp.controller('DashController', function($scope, $http) {
    $scope.entries = [];
    $scope.newEntryText = '';

    console.log('getting entries...');
    $http.get('/api/v1/entries')
        .success(function(data,status,headers,config) {
            $scope.entries = data['entries'];
            console.log('    success. got ' + $scope.entries.length + ' entries');
            // convert timestamps from seconds to milliseconds
            for (var ii in $scope.entries) {
                $scope.entries[ii].timestamp *= 1000;
            }
        })
        .error(function(data,status,headers,config) {
            console.log('    error');
        });

    var getUUID = function() {
        return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        }); 
    };
    var copyObject = function(obj) {
        var result = {};
        for (var key in obj) {
            result[key] = obj[key];
        }
        return result;
    };

    $scope.addNewEntry = function() {
        console.log('adding new entry: ' + $scope.newEntryText);

        // construct new entry object
        // use javascript style timestamp
        var newEntry = {};
        newEntry.text = $scope.newEntryText;
        newEntry.timestamp = Math.floor(new Date().getTime()/1000) * 1000;
        newEntry.uuid = getUUID();
        console.log(newEntry);

        // update local state
        $scope.entries.push(newEntry);
        $scope.newEntryText = '';

        // make a copy using server style timestamp
        var newEntryForServer = copyObject(newEntry);
        newEntryForServer.timestamp = Math.floor(newEntry.timestamp / 1000);

        // send up to server
        console.log('posting to server...');
        console.log(newEntryForServer);
        $http.post('/api/v1/entries', newEntryForServer)
            .success(function(data,status,headers,config) {
                console.log('    success');
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });
    };

    $scope.deleteEntry = function(entry) {
        console.log('deleting entry:');
        console.log(entry);

        // update local state
        $scope.entries.splice($scope.entries.indexOf(entry), 1);

        // delete from server
        console.log('deleting from server...');
        $http.delete('/api/v1/entries/'+entry.uuid)
            .success(function(data,status,headers,config) {
                console.log('    success');
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });
    };

    $scope.editEntry = function(entry) {
        console.log('editing entry:');
        console.log(entry);

        // get new text from user
        var input = prompt('Edit to-do item:', entry.text);
        if (!input) {
            return;
        }

        // update local state
        entry.text = input;

        // make a copy using server style timestamp
        var entryForServer = copyObject(entry);
        entryForServer.timestamp = Math.floor(entry.timestamp / 1000);

        // send up to server
        console.log('posting to server...');
        console.log(entryForServer);
        $http.put('/api/v1/entries/'+entryForServer.uuid, entryForServer)
            .success(function(data,status,headers,config) {
                console.log('    success');
            })
            .error(function(data,status,headers,config) {
                console.log('    error');
            });

    }
});








