require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
'use strict';

// require lodash when in node; otherwise get it from the global window object
var isNode = typeof window === 'undefined';
var _;
if (isNode) {
	_ = require('lodash');
} else {
	_ = window._;
}

var deepCopy = _.cloneDeep;
var deepEquals = _.isEqual;

//================================================================================

function StateObserver(initialState) {
	// initialState: a javascript object.  optional; default is an empty object.

	if (initialState === undefined) {
		this.state = {};
	} else if (_.isPlainObject(initialState)) {
		this.state = deepCopy(initialState);
	} else {
		throw 'initialState must be a plain js object, not ' + initialState;
	}
	this.subscriptions = [];
}

//================================================================================
// SUBSCRIPTIONS

StateObserver.prototype.onChange = function(keyPath, callback) {
	// call like onChange('keyPath', function...) or onChange(function...)
	// keyPath is optional and defaults to '', meaning "the whole state object".
	// callback should be function(newVal, oldVal)

	// allow missing keyPath
	if ((keyPath instanceof Function) && callback == undefined) {
		var keyPath_ = '';
		var callback_ = keyPath;
	} else if (typeof keyPath === 'string' && (callback instanceof Function)) {
		var keyPath_ = keyPath;
		var callback_ = callback;
	} else {
		throw 'incorrect parameters to StateObserver.onChange()';
	}

	var id = Math.floor(Math.random() * 999999);
	var that = this;
	var unsubscribeFn = function() {
		that.subscriptions = that.subscriptions.filter(function(subscription) {
			return subscription.id !== id;
		});
	};
	this.subscriptions.push({
		id: id,
		keyPath: keyPath_,
		prevValue: this.get(keyPath_),
		callback: callback_,
	});
	return unsubscribeFn;
};

StateObserver.prototype.alertSubscribersAsNeeded = function() {
	// check subscriptions to see if they need to be fired.
	// if so, fire their callback.
	// this must be called (internally) after anything that changes this._state
	this.subscriptions.forEach(function(subscription) {
		var newVal = this.get(subscription.keyPath);
		if (!deepEquals(subscription.prevValue, newVal)) {
			subscription.callback(deepCopy(newVal), subscription.prevValue);
			subscription.prevValue = newVal;
		}
	}, this);
};

//================================================================================
// STATE HANDLING

StateObserver.prototype.get = function(keyPath) {
	// keyPath is optional.  defaults to root if not set.
	// Return undefined if the keyPath is bad.
	var keyParts = keyPath ? keyPath.split('.') : [];
	var here = this.state;
	for (var ii = 0; ii < keyParts.length; ii++) {
		here = here[keyParts[ii]];
		if (here === undefined) { return undefined; }
	}
	return deepCopy(here);
};

StateObserver.prototype.set = function(keyPath, value) {
	var keyParts = keyPath ? keyPath.split('.') : [];
	if (keyParts.length === 0) {
		// empty keyPath means replace root object completely
		this.state = deepCopy(value);
	} else {
		var here = this.state;
		for (var ii = 0; ii < keyParts.length - 1; ii++) {
			var thisKey = keyParts[ii];
			var nextKey = keyParts[ii + 1];
			// create layers as needed
			if (here[thisKey] === undefined) {
				// if the next key is a number, create array instead of object
				if (!isNaN(Number(nextKey))) {
					here[thisKey] = [];
				} else {
					here[thisKey] = {};
				}
			}
			here = here[thisKey];
		}
		here[keyParts[keyParts.length - 1]] = deepCopy(value);
	}
	this.alertSubscribersAsNeeded();
};

StateObserver.prototype.pushTo = function(keyPath, value) {
	var array = this.get(keyPath);
	if (!Array.isArray(array)) {
		throw 'pushToState\'s target must be an array, not ' + array;
	}
	array.push(value);
	this.set(keyPath, array); // setState does the deepCopy for us
};

module.exports = StateObserver;

},{"lodash":1}],"/rigorhub.js":[function(require,module,exports){
'use strict';

var StateObserver = require('./state-observer.js');

exports.pageState = new StateObserver({});

// TODO: helper methods which to AJAX calls and also modify state.
exports.api = {
	addPerceptTag: function(perceptId, tag) { /* TODO */ },
	setPerceptTags: function(perceptId, tags) { /* TODO */ },
	// etc
};

},{"./state-observer.js":2}]},{},[]);
