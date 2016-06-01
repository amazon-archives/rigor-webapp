"use strict";

(function() {

var RH = require('/rigorhub.js');
var currentView = RH.pageState.get('current_view');
var pageState = RH.pageState.get(currentView);

var kPerceptSearchPage = 'percept_search_page';
var kPerceptDetailPage = 'percept_detail_page';

// bail out early if we can
if (currentView == kPerceptDetailPage) {
	var percept = pageState.percept;
	if (percept.x_size != null || percept.y_size != null) {
		return;
	}
} else if (currentView == kPerceptSearchPage) {
	var missing = false;
	var percepts = pageState.search_results;
	for (var i=0; i < percepts.length; i++) {
		if (percepts[i].x_size == null && percepts[i].y_size == null) {
			missing = true;
			break;
		}
	}
	if (!missing) {
		return;
	}
} else {
	return; // not supported, should not have been called
}

// if we can't bail out early, hook into onreadystatechange
var tmp = document.onreadystatechange;
document.onreadystatechange = function() {
	if (tmp) {
		tmp();
	}
	if (document.readyState == "interactive") {
		if (kPerceptSearchPage == currentView) {
			lazy_fix_missing_thumbnail_image_sizes();
		} else {
			lazy_fix_missing_detail_image_size();
		}
	}
	if (document.readyState == "complete") {
		if (currentView == kPerceptDetailPage) {
			lazy_fix_adjust_svg();
		}
	}
};

function lazy_fix_url_for_percept(db_name, percept_id) {
	return '/lazy_fix_missing_image_sizes/db/' + db_name + '/percept/'+percept_id;
}

// just fix the svg based on the info we get when the image finishes loading, don't
// worry about handling the db update response
function lazy_fix_adjust_svg() {
	var percept = pageState.percept;
	var mainPanel = document.getElementsByClassName('mainPanel')[0];
	var loadedImg = mainPanel.getElementsByTagName("IMG")[0];
	var svgDiv = loadedImg.nextElementSibling;
	var widthAndHeight = 'width: '+loadedImg.naturalWidth+'px; height: '+loadedImg.naturalHeight+'px;';
	svgDiv.setAttribute('style', widthAndHeight);
	var svg = svgDiv.getElementsByTagName("svg")[0];
	svg.setAttribute('style', widthAndHeight);
}

function lazy_fix_missing_detail_image_size() {
	//TODO: update page state with resulting image size?
	var db_name = pageState.db_name;
	var percept = pageState.percept;
	var percept_id = percept.id;
	(function(percept_id, db_name) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET',lazy_fix_url_for_percept(db_name, percept_id), true);
		xhr.onload = function(e) {
			if (xhr.readyState === 4) {
				if (xhr.status !== 200) {
					console.error(xhr.statusText);
				}
			}
		}
		xhr.send(null)
		xhr.onerror = function(e) {
			console.error(xhr.statusText);
		}
	})(percept_id, db_name);
}

function lazy_fix_missing_thumbnail_image_sizes() {
	//TODO: update page state with resulting thumbnail sizes?
	var search_results_json = pageState.search_results;
	var missing_images = document.getElementsByClassName('missingImage');
	var db_name = pageState.db_name;
	while (missing_images.length > 0) {
		var missing_div = missing_images[missing_images.length-1];
		var max_thumb_size = missing_div.style.height.split("px")[0]
		var missing_href = missing_div.parentNode;
		missing_div.className='fixingImage';
		// URL like http://{server:port}/db/{dbname}/percept/{perceptid} -> /api/v1/db/{dbname}/percept/{perceptid}/data?max_size={max_thumb_size}
		var href_parts = missing_href.href.split("/");
		var percept_id = href_parts[6];
		(function(percept_id, db_name, missing_href) {
			missing_href.style.minHeight = max_thumb_size;
			missing_href.style.minWidth = max_thumb_size;
			var xhr = new XMLHttpRequest();
			xhr.open('GET',lazy_fix_url_for_percept(db_name, percept_id), true);
			xhr.onload = function(e) {
				if (xhr.readyState === 4) {
					if (xhr.status === 200) {
						var json = JSON.parse(xhr.responseText);
						missing_href.innerHTML = '<img class="searchResultImg" src="/api/v1/db/' + db_name + '/percept/'+percept_id+'/data?max_size='+max_thumb_size+'" width="'+json.thumb_width+'" height="'+json.thumb_height+'" />';
					} else {
						console.error(xhr.statusText);
					}
				}
			}
			xhr.send(null)
			xhr.onerror = function(e) {
				console.error(xhr.statusText);
			}
		})(percept_id, db_name, missing_href);
	}
}

})();
