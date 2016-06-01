'use strict';

document.getElementById('perceptSearchForm').addEventListener("submit", function(event) {
	event.preventDefault();

	// collect query parameters from form elements
	var domIdToParam = {
		'perceptSearchFormLocator': 'locator',
		'perceptSearchFormDeviceId': 'device_id',
		'perceptSearchFormCollectionId': 'collection_id',
		'perceptSearchFormHash': 'hash',
		'perceptSearchFormAnnotationDomain': 'annotation_domain',
		'perceptSearchFormAnnotationModel': 'annotation_model',
		'perceptSearchFormAnnotationProperty': 'annotation_property',
		'perceptSearchFormPerceptProperty': 'percept_property',
		'perceptSearchFormRandomNth': 'random_nth',
		'perceptSearchFormRandomOutOf': 'random_out_of',
	};
	var params = {page: 1}; // new search resets page back to 1
	Object.keys(domIdToParam).forEach(function(domId) {
		var value = document.getElementById(domId).value.trim();
		if (value.length > 0) {
			params[domIdToParam[domId]] = value;
		}
	});
	var queryString = Object.keys(params).map(function(key) {
		return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
	}).join('&');

	// special case for db select
	var dbSelectElem = document.getElementById('perceptSearchFormDbSelect');
	var dbName = dbSelectElem.options[dbSelectElem.selectedIndex].value;

	var newUrl = '/db/' + dbName + '/perceptsearch?' + queryString;
	window.location.href = newUrl;
});
