'use strict';

(function() {

/* This code monitors the saveState of the api plugin and shows a button
 * allowing the user to trigger a save.
 */

//================================================================================
// RESOURCES

var RH = require('/rigorhub.js');
var API = window.API;
var saveButtonElem = document.getElementById('api_save_button');

//================================================================================
// DOM CHANGES

var showNothingToSaveState = function() {
	saveButtonElem.innerHTML = 'Saved';
	saveButtonElem.classList.add('apiIndicatorSaved');
	saveButtonElem.classList.remove('apiIndicatorCanSave');
	saveButtonElem.classList.remove('apiIndicatorSaving');
	saveButtonElem.classList.remove('apiIndicatorError');
	saveButtonElem.disabled = true;
};
var showCanSaveState = function() {
	saveButtonElem.innerHTML = 'Press Tab to save';
	saveButtonElem.classList.remove('apiIndicatorSaved');
	saveButtonElem.classList.add('apiIndicatorCanSave');
	saveButtonElem.classList.remove('apiIndicatorSaving');
	saveButtonElem.classList.remove('apiIndicatorError');
	saveButtonElem.disabled = false;
};
var showSavingState = function() {
	saveButtonElem.innerHTML = 'Saving...';
	saveButtonElem.classList.remove('apiIndicatorSaved');
	saveButtonElem.classList.remove('apiIndicatorCanSave');
	saveButtonElem.classList.add('apiIndicatorSaving');
	saveButtonElem.classList.remove('apiIndicatorError');
	saveButtonElem.disabled = true;
};
var showErrorState = function() {
	saveButtonElem.innerHTML = 'Error saving.  Try again.';
	saveButtonElem.classList.remove('apiIndicatorSaved');
	saveButtonElem.classList.remove('apiIndicatorCanSave');
	saveButtonElem.classList.remove('apiIndicatorSaving');
	saveButtonElem.classList.add('apiIndicatorError');
	saveButtonElem.disabled = false;
};
// set initial state
showNothingToSaveState();

//================================================================================

API.onSaveStateChange(function(saveState) {
	var stateToFn = {
		nothing_to_save: showNothingToSaveState,
		can_save: showCanSaveState,
		saving: showSavingState,
		error: showErrorState,
	};
	stateToFn[saveState]();
});

saveButtonElem.onclick = function() {
	API.saveNow();
}

})();
