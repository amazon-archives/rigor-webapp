'use strict';

var StateObserver = require('./state-observer.js');

exports.pageState = new StateObserver({});

// TODO: helper methods which to AJAX calls and also modify state.
exports.api = {
	addPerceptTag: function(perceptId, tag) { /* TODO */ },
	setPerceptTags: function(perceptId, tags) { /* TODO */ },
	// etc
};
