'use strict';

(function(window) {

var jsonAjax = function(url, method, data, cb) {
	/* Sends an HTTP POST with the given data, as JSON, the the given url.
	 * Data should be a Javascript value; it will be JSONified by this function.
	 * When done, call the callback cb(err, parsedJsonResponse).
	 */
	var xhr = new XMLHttpRequest();
	cb = cb || function() {};
	xhr.onreadystatechange = function() {
		if (xhr.readyState === 4) {
			if (xhr.status === 200) {
				var result = null;
				try {
					result = JSON.parse(xhr.responseText);
				} catch (err) {
					// invalid json
					cb(err, null);
				}
				cb(null, result);
			} else {
				// non-200 HTTP response
				cb({http_status: xhr.status}, null);
			}
		}
	}
	xhr.open(method, url);  // TODO
	xhr.setRequestHeader('Content-type', 'application/json');
	xhr.send(JSON.stringify(data));
};

var _saveState = 'nothing_to_save';  // nothing_to_save, can_save, saving, error
var _saveStateCallbacks = [];
var _setSaveState = function(newSaveState) {
	if (newSaveState === _saveState) {
		return;
	}
	_saveState = newSaveState;
	_saveStateCallbacks.forEach(function(callback) {
		callback(newSaveState);
	});
};
var _numAjaxInFlight = 0;

window.API = {
	// TODO: queue up changes in the browser and send them in a batch every second or so.

	jsonAjax: jsonAjax,

	adviseOfUnsavedData: function() {
		/* This is a temporary hack to allow other plugins to set the saveState to 'can_save'
		 * when they have data waiting around that hasn't been saved yet.
		 */
		_setSaveState('can_save');
	},
	setAnnotationField: function(dbName, annotationId, fieldName, value, callback) {
		/* Sends an AJAX request to set an annotation's field.
		 * When the request finishes, the callback is called:
		 *	callback(err, null)
		 *	callback(null, data)  // where data is the json response from the server
		 */
		var url = '/api/v1/db/' + dbName + '/annotation/' + annotationId + '/field/' + fieldName;
		_setSaveState('saving');
		_numAjaxInFlight += 1;
		jsonAjax(url, 'POST', value, function(err, parsedJsonResponse) {
			_numAjaxInFlight = Math.max(0, _numAjaxInFlight - 1);
			if (err) {
				console.log('API error in setAnnotationField');
				console.log(err);
				_setSaveState('error');
			} else {
				if (_numAjaxInFlight === 0) {
					_setSaveState('nothing_to_save');
				}
			}
			if (callback) {
				callback(err, parsedJsonResponse);
			}
		});
	},
	deleteAnnotation: function(dbName, annotationId, callback) {
		/* Sends an AJAX request to delete an annotation.
		 * When the request finishes, the callback is called:
		 *	callback(err, null)
		 *	callback(null, data)  // where data is the json response from the server
		 */
		var url = '/api/v1/db/' + dbName + '/annotation/' + annotationId;
		_setSaveState('saving');
		_numAjaxInFlight += 1;
		jsonAjax(url, 'DELETE', null, function(err, parsedJsonResponse) { // TODO
			_numAjaxInFlight = Math.max(0, _numAjaxInFlight - 1);
			if (err) {
				console.log('API error in deleteAnnotation');
				console.log(err);
				_setSaveState('error');
			} else {
				if (_numAjaxInFlight === 0) {
					_setSaveState('nothing_to_save');
				}
			}
			if (callback) {
				callback(err, parsedJsonResponse);
			}
		});
	},
	createAnnotation: function(dbName, newAnnotation, callback) {
		/* Sends an AJAX request to insert a new annotation.
		 * When the request finishes, the callback is called:
		 *	callback(err, null)
		 *	callback(null, newId)  // newId is the id assigned by the server
		 */
		var url = '/api/v1/db/' + dbName + '/annotation';
		_setSaveState('saving');
		_numAjaxInFlight += 1;
		jsonAjax(url, 'POST', newAnnotation, function(err, parsedJsonResponse) {
			_numAjaxInFlight = Math.max(0, _numAjaxInFlight - 1);
			if (err) {
				console.log('API error in createAnnotation');
				console.log(err);
				_setSaveState('error');
				if (callback) { callback(err, null); }
			} else {
				if (_numAjaxInFlight === 0) {
					_setSaveState('nothing_to_save');
				}
				if (callback) { callback(null, parsedJsonResponse.new_id); }
			}
		});
	},
	getSaveState: function() {
		/* Get the current saveState of the API AJAX queue.
		 * One of: 'nothing_to_save', 'can_save', 'saving', 'error'.
		 * 'error' means an AJAX request failed and needs to be retried; it's similar to 'can_save'
		 */
		return _saveState;
	},
	onSaveStateChange: function(callback) {
		/* When the saveState changes, call cb(newState)
		 */
		_saveStateCallbacks.push(callback);
	},
	saveNow: function() {
		/* Tell the queue to save now instead of waiting a while.
		 * Has no effect if a save is already in progress.
		 */
		console.log('API saveNow: not implemented yet');  // TODO
	},

};

})(window);

