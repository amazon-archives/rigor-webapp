"use strict";

var RH = require('/rigorhub.js');

console.log('plugin_example: tail script loaded');
console.log('plugin_example: pageState is...');
console.log(RH.pageState.get());

if (RH.pageState.get('current_view') == 'percept_search_page') {
	console.log('plugin_example: we are on the percept search page.  modifying page content to display number of search results in our sidebar box');
	var slotElem = document.getElementById('plugin_example_num_search_results');
	slotElem.innerHTML = '' + RH.pageState.get('percept_search_page.search_results').length;
}

