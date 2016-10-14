'use strict';

(function() {

//============================================================================================

/*
	pageState from server:
		// these are never changed by the client while the page is loaded
		catapult.all_categories  // list of all possible categories
		catapult.categories_do_not_include  // map from cat name to descriptive text
		catapult.db_name
		catapult.db_names
		catapult.domain
	pageState created locally:
		catapult.done  // bool: did we hit the end of all available images?
		catapult.next_percepts  // [next, after that, after that...]
		catapult.percept  // currently viewed image, or null/undefined
					.id
					.categories  // map from string -> annotation id
								 // the id will be just true while the annotation is still saving
		catapult.prev_percepts  // [oldest, less old, most recent]
		catapult.batch_is_loading  // bool
		catapult.category_to_show_help_for  // or null
	
		a special percept with id -1 will appear at the end when all
		other images are complete
*/
var RH = require('/rigorhub.js');
var API = window.API; // provided by the "api" plugin

var SHOW_DEBUG_PANE = false;

// buffer of prev and next percepts
var AJAX_BATCH_SIZE = 20;  // how many percepts to fetch at a time?
var FETCH_MORE_WHEN_N_LEFT = 10;  // fetch more when the next buffer has this many items in it
var PREV_BUFFER = 100;  // how many percepts to remember in the prev-buffer?
var VISIBLE_NEXT_BUFFER = 5;  // how far into the next-buffer should we display images for preloading?
var VISIBLE_PREV_BUFFER = 5;

//============================================================================================
// INITIAL PAGESTATE

RH.pageState.set('catapult.done', false);
RH.pageState.set('catapult.prev_percepts', []);
RH.pageState.set('catapult.percept', undefined);
RH.pageState.set('catapult.next_percepts', []);
RH.pageState.set('catapult.batch_is_loading', false);
RH.pageState.set('catapult.category_to_show_help_for', null);

//============================================================================================
// HELPERS

function zeroPad(num, len) {
	// return num as a zero-padded string of length len
	var s = '' + num;
	while (s.length < len) { s = '0' + s; }
	return s;
}

var nullOrUndefined = function(a) { return a === null || a === undefined; }

var makeImageUrl = function(perceptId) {
	if (perceptId === -1) {
		// image -1 is a special marker showing we reached the end of all the images
		// show a star
		return 'http://emojipedia.org/wp-content/uploads/2013/07/160x160x297-white-medium-star.png.pagespeed.ic.Nov6K53D2p.jpg';
	}
	var db_name = RH.pageState.get('catapult.db_name');
	return '/api/v1/db/' + db_name + '/percept/' + perceptId + '/data?max_size=500';
}

var selectWithoutReplacement = function(array, num) {
	// return num random elements from the array, without replacement
	// if array is too small, return less than num elements
	var result = [];
	while (result.length < Math.min(num, array.length)) {
		var elem = array[Math.floor(Math.random()*array.length)];
		if (result.indexOf(elem) === -1) {
			result.push(elem);
		}
	}
	return result;
}

//============================================================================================
// ACTIONS

var actions = {
	getPercept: function(perceptId) {
		// look through next_percepts, prev_percepts, and percept
		// and return the data for the percept with the given id
		// if not found, return null
		var percepts = [RH.pageState.get('catapult.percept')];
		percepts = percepts.concat(RH.pageState.get('catapult.next_percepts'));
		percepts = percepts.concat(RH.pageState.get('catapult.prev_percepts'));
		percepts = percepts.filter(function(percept) {return !nullOrUndefined(percept)});
		for (var ii = 0; ii < percepts.length; ii++) {
			if (percepts[ii].id === perceptId) {
				return percepts[ii];
			}
		}
		return null;
	},
	setPercept: function(percept) {
		// look through next_percepts, prev_percepts, and percept
		// to find the percept which matches the given percept's id.
		// replace it there.
		var p = RH.pageState.get('catapult.percept');
		if (p && p.id === percept.id) {
			RH.pageState.set('catapult.percept', percept);
			return;
		}
		var percepts = RH.pageState.get('catapult.next_percepts');
		for (var ii=0; ii < percepts.length; ii++) {
			if (percepts[ii].id === percept.id) {
				RH.pageState.set('catapult.next_percepts.' + ii, percept);
				return;
			}
		}
		var percepts = RH.pageState.get('catapult.prev_percepts');
		for (var ii=0; ii < percepts.length; ii++) {
			if (percepts[ii].id === percept.id) {
				RH.pageState.set('catapult.prev_percepts.' + ii, percept);
				return;
			}
		}
	},
	addCategory: function(perceptId, category) {
		console.log('addCategory(' + perceptId + ', "' + category + '")');
		// add a new category to the current percept
		var categories = RH.pageState.get('catapult.percept.categories');
		if (nullOrUndefined(categories)) { return; }
		if (categories[category] !== undefined) { return; }
		categories[category] = true;  // set to true while waiting for id from server
		RH.pageState.set('catapult.percept.categories', categories);

		// create on server
		var db_name = RH.pageState.get('catapult.db_name');
		var newAnnotation = {
			confidence: 1,
			domain: RH.pageState.get('catapult.domain'),
			model: category,
			percept_id: perceptId,
			stamp: Math.floor((new Date()).getTime() / 1000),
			properties: {
				source: 'catapult',
			},
			tags: [],
		};
		API.createAnnotation(db_name, newAnnotation, function(err, newId) {
			if (err) {
				console.log('addCategory error from ajax');
				console.log(err);
			} else {
				console.log('...success');
				// save the id locally
				// we may have switched away to view a different percept by now
				// so we need to find the original percept
				// and update it, wherever it is (next_percepts, etc)
				var updatedPercept = actions.getPercept(perceptId);
				updatedPercept.categories[category] = newId;
				actions.setPercept(updatedPercept);
			}
		});
	},
	removeCategory: function(category) {
		var categories = RH.pageState.get('catapult.percept.categories');
		if (nullOrUndefined(categories)) { return; }
		var id = categories[category];
		console.log('removeCategory("' + category + '") with id ' + id);
		delete categories[category];
		RH.pageState.set('catapult.percept.categories', categories);

		// delete from server if it was already created there (it has a real id)
		if (id !== true) {
			var db_name = RH.pageState.get('catapult.db_name');
			API.deleteAnnotation(db_name, id, function(err, data) {
				if (err) {
					console.log('removeCategory error from ajax');
					console.log(err);
				} else {
					console.log('...success');
				}
			});
		}
	},
	jumpForwardOrBack: function(ii) {
		// roll forward or back by ii steps in the history buffer
		// ii can be positive (go forward) or negative (go back)
		while (ii !== 0) {
			if (ii > 0) {
				actions.nextPerceptButton();
				ii -= 1;
			} else {
				actions.prevPerceptButton();
				ii += 1;
			}
		}
	},
	prevPerceptButton: function() {
		var next = RH.pageState.get('catapult.next_percepts');
		var current = RH.pageState.get('catapult.percept');
		var prev = RH.pageState.get('catapult.prev_percepts');
		if (prev.length === 0) { return; }
		if (!nullOrUndefined(current)) {
			next.unshift(current);
			RH.pageState.set('catapult.next_percepts', next);
		}
		current = prev.pop();
		RH.pageState.set('catapult.prev_percepts', prev);
		RH.pageState.set('catapult.percept', current);
	},
	nextPerceptButton: function() {
		var next = RH.pageState.get('catapult.next_percepts');
		var current = RH.pageState.get('catapult.percept');
		var prev = RH.pageState.get('catapult.prev_percepts');
		if (next.length === 0) { return; }
		if (!nullOrUndefined(current)) {
			prev.push(current);
			if (prev.length > PREV_BUFFER) {
				prev.shift();
			}
			RH.pageState.set('catapult.prev_percepts', prev);
		}
		current = next.shift();
		RH.pageState.set('catapult.next_percepts', next);
		RH.pageState.set('catapult.percept', current);
		actions.loadMorePerceptsIfNeeded();
	},
	_insertPercept: function(percept) {
		// Receive a percept from the server and add it to the client-side pageState
		// It goes into the current percept if that's null/undefined, or at the end
		// of next_percepts otherwise.
		if (nullOrUndefined(RH.pageState.get('catapult.percept'))) {
			RH.pageState.set('catapult.percept', percept);
		} else {
			var nextPercepts = RH.pageState.get('catapult.next_percepts');
			if (nullOrUndefined(nextPercepts)) {
				nextPercepts = [];
			}
			nextPercepts.push(percept);
			RH.pageState.set('catapult.next_percepts', nextPercepts);
		}
	},
	loadMorePerceptsIfNeeded: function() {
		// Fetch a batch of percepts and add them into the pageState
		// Won't run if an ajax load is already in progress or if there are enough next_percepts
		if (RH.pageState.get('catapult.batch_is_loading') === true) { return; }
		var next_percepts = RH.pageState.get('catapult.next_percepts');
		if (next_percepts.length > FETCH_MORE_WHEN_N_LEFT) { return; }

		// if we're done or almost done, an image with id -1 will be present
		if (next_percepts.length > 0 && next_percepts[next_percepts.length-1].id === -1) { return; }
		if (RH.pageState.get('catapult.percept.id') === -1) { return; }

		console.log('actions.loadMorePerceptsIfNeeded');
		RH.pageState.set('catapult.batch_is_loading', true);
		var db_name = RH.pageState.get('catapult.db_name');
		var url = '/db/' + db_name + '/catapult/api/percepts_to_label?n=' + AJAX_BATCH_SIZE;
		var startTime = (new Date).getTime();
		API.jsonAjax(url, 'GET', null, function(err, data) {
			var elapsedTime = (new Date).getTime() - startTime;
			console.log('catapult loadMorePerceptsIfNeeded: query time ' + (elapsedTime / 1000) + ' seconds');
			if (err) {
				console.log('catapult loadMorePerceptsIfNeeded error');
				console.log(err);
			}
			else {
				var percepts = data['percepts'];
				if (percepts.length === 0 && RH.pageState.get('catapult.done') === false) {
					percepts.push({
						id: -1,
					});
					RH.pageState.set('catapult.done', true);
				}
				percepts.forEach(function(percept) {
					percept.categories = {};

					/*
					// HACK to include dummy categories for testing the UI
					var numCats = Math.floor(Math.random() * 4);
					var randomCats = selectWithoutReplacement(RH.pageState.get('catapult.all_categories'), numCats);
					randomCats.forEach(function(cat) {
						percept.categories[cat] = 12399999999;
					});
					*/

					actions._insertPercept(percept);
				});
			}
			RH.pageState.set('catapult.batch_is_loading', false);
		})
	},
};

//============================================================================================
// REACT UI ELEMENTS

var CatapultMaster = React.createClass({
	render: function() {
		return <div>
			<div className="catapult-image-pane">
				<ImagePane />
				<ImageHistoryBar />
			</div>
			<div className="catapult-sidebar">
				<SidebarHeader />
				<SidebarPrevNext />
				<div className="catapult-sidebar-divider"/>
				<SidebarChosenCategories />
				<SidebarAutocompletingInput />
				<SidebarInstructions />
			</div>
			<div className="catapult-footer">
				<div className="catapult-footer-content">
					<div className="catapult-pull-left">
						{/* TODO: progress indicator (45% of percepts complete) */}
					</div>
					<div className="catapult-pull-right">
						<SaveIndicator />
					</div>
				</div>
			</div>
			{SHOW_DEBUG_PANE ? <DebugPane /> : null}
		</div>;
	},
});

var SaveIndicator = React.createClass({
	getInitialState: function() {
		// nothing_to_save, can_save, saving, error
		return {saveState: API.getSaveState()};
	},
	componentWillMount: function() {
		var that = this;
		API.onSaveStateChange(function(newValue) {
			that.setState({saveState: newValue});
		});
	},
	render: function() {
		var text = {
			nothing_to_save: 'Saved',
			can_save: 'Unsaved',
			saving: 'Saving...',
			error: 'Error',
		}
		return <span className={'catapult-save-indicator-'+this.state.saveState.split('_').join('-')}>
			{text[this.state.saveState]}
		</span>;
	},
});

var DebugPane = React.createClass({
	getInitialState: function() {
		// subscribe to changes
		var that = this;
		RH.pageState.onChange('catapult.prev_percepts', function(prevPercepts) {
			that.setState({prevPercepts: prevPercepts});
		});
		RH.pageState.onChange('catapult.percept', function(percept) {
			that.setState({percept: percept});
		});
		RH.pageState.onChange('catapult.next_percepts', function(nextPercepts) {
			that.setState({nextPercepts: nextPercepts});
		});
		return {
			prevPercepts: RH.pageState.get('catapult.prev_percepts'),
			percept: RH.pageState.get('catapult.percept'),
			nextPercepts: RH.pageState.get('catapult.next_percepts'),
			paneIsExpanded: true,
		}
	},
	_togglePane: function(e) {
		this.setState({paneIsExpanded: !this.state.paneIsExpanded});
	},
	render: function() {
		if (this.state.paneIsExpanded) {
			var prevIds = JSON.stringify(this.state.prevPercepts.map(function(percept) { return percept.id; }));
			var nextIds = JSON.stringify(this.state.nextPercepts.map(function(percept) { return percept.id; }));
			return <div className="catapult-debug-pane" onClick={this._togglePane} key="open">
				<div className="catapult-debug-pane-row"><b>Debug info</b></div>
				<div className="catapult-debug-pane-row">prev percepts: {prevIds}</div>
				<div className="catapult-debug-pane-row">percept: {JSON.stringify(this.state.percept, null, 1)}</div>
				<div className="catapult-debug-pane-row">next percepts: {nextIds}</div>
			</div>
		} else {
			return <div className="catapult-debug-pane" onClick={this._togglePane} key="closed">
				<div className="catapult-debug-pane-row"><b>Debug info</b></div>
			</div>
		}
	},
});

var ImageHistoryBar = React.createClass({
	getInitialState: function() {
		// subscribe to changes
		var that = this;
		RH.pageState.onChange('catapult.prev_percepts', function(prevPercepts) {
			that.setState({prevPercepts: prevPercepts});
		});
		RH.pageState.onChange('catapult.percept', function(percept) {
			that.setState({percept: percept});
		});
		RH.pageState.onChange('catapult.next_percepts', function(nextPercepts) {
			that.setState({nextPercepts: nextPercepts});
		});
		RH.pageState.onChange('catapult.batch_is_loading', function(batchIsLoading) {
			that.setState({batchIsLoading: batchIsLoading});
		});
		return {
			prevPercepts: RH.pageState.get('catapult.prev_percepts'),
			percept: RH.pageState.get('catapult.percept'),
			nextPercepts: RH.pageState.get('catapult.next_percepts'),
			batchIsLoading: RH.pageState.get('catapult.batch_is_loading'),
		};
	},
	render: function() {
		//if (nullOrUndefined(this.state.percept)) { return null; }
		var historyImages = [];
		for (var jj = -VISIBLE_PREV_BUFFER; jj <= VISIBLE_NEXT_BUFFER; jj++) {
			if (jj < 0) {
				if (-jj <= this.state.prevPercepts.length) {
					var id = this.state.prevPercepts[this.state.prevPercepts.length + jj].id;
					historyImages.push(
						<img className="catapult-history-image"
							src={makeImageUrl(id)}
							key={"history-prev-image-" + id}
							onClick={actions.jumpForwardOrBack.bind(null, jj)}
							/>
					);
				} else {
					historyImages.push(<div className="catapult-history-image catapult-history-image-empty" key={"empty-"+jj} />);
				}
			} else if (jj === 0) {
				if (nullOrUndefined(this.state.percept)) {
					historyImages.push(<div className="catapult-history-image catapult-history-image-empty catapult-history-image-empty-loading" key={"empty-"+jj} />);
				} else {
					var id = this.state.percept.id;
					historyImages.push(
						<img className="catapult-history-image catapult-history-image-current"
							src={makeImageUrl(id)}
							key={"history-current-image-" + id}
							/>
					);
				}
			} else if (jj > 0) {
				if (jj <= this.state.nextPercepts.length) {
					var id = this.state.nextPercepts[jj-1].id;
					historyImages.push(
						<img className="catapult-history-image"
							src={makeImageUrl(id)}
							key={"history-next-image-" + id}
							onClick={actions.jumpForwardOrBack.bind(null, jj)}
							/>
					);
				} else {
					var loadingClass = this.state.batchIsLoading ? ' catapult-history-image-empty-loading' : '';
					historyImages.push(<div className={"catapult-history-image catapult-history-image-empty" + loadingClass} key={"empty-"+jj} />);
				}
			}
		}
		return <div className="catapult-history-bar">
			{historyImages}
		</div>
	}
});

var ImagePane = React.createClass({
	getInitialState: function() {
		// subscribe to changes
		var that = this;
		RH.pageState.onChange('catapult.percept', function(percept) {
			that.setState({percept: percept});
		});
		return {
			percept: RH.pageState.get('catapult.percept'),
			startTime: (new Date).getTime(),
		};
	},
	render: function() {
		var that = this;
		if (nullOrUndefined(this.state.percept)) {
			// the initial ajax load is still running and we have no percepts

			var updateEvery = 1000;
			var showMessageAfter = 2000;
			var showTimerAfter = 5000;

			setTimeout(this.forceUpdate.bind(this), updateEvery);

			var timeSinceLoad = (new Date).getTime() - this.state.startTime;
			var sec = Math.floor(timeSinceLoad/1000)
			var min = Math.floor(sec/60)
			sec = sec % 60;
			var timeString = zeroPad(min, 2) + ':' + zeroPad(sec, 2);

			return <div className="catapult-main-image-container" key="loading">
				<div className="catapult-loading-image-pane">
					<div className="catapult-loading-image-pane-title">Finding images to annotate...</div>
					<div className="catapult-loading-image-pane-body">{timeSinceLoad > showMessageAfter ? 'This can take a long time.' : ''}&nbsp;</div>
					<div className="catapult-loading-image-pane-body">{timeSinceLoad > showTimerAfter ? timeString : ''}&nbsp;</div>
				</div>
			</div>;
		} else if (this.state.percept.id === -1) {
			// special image representing the end of all images
			return <div className="catapult-main-image-container" key="done">
				<div className="catapult-loading-image-pane">
					<div className="catapult-huge-emoji">⭐️ </div>
					<div className="catapult-loading-image-pane-title">Done!</div>
					<div className="catapult-loading-image-pane-body">Every image has been annotated.</div>
					<div className="catapult-loading-image-pane-body">&nbsp;</div>
				</div>
			</div>;
		} else {
			return <div className="catapult-main-image-container" key={"image-" + this.state.percept.id}>
					<img className="catapult-main-image" src={makeImageUrl(this.state.percept.id)} />
			</div>;
		}
	}
});

var SidebarHeader = React.createClass({
	getInitialState: function() {
		return {
			// assume that these won't change while this page is loaded
			db_name: RH.pageState.get('catapult.db_name'),
			db_names: RH.pageState.get('catapult.db_names'),
		}
	},
	render: function() {
		var that = this;
		return <div className="catapult-sidebar-header clearfix">
			<div className="catapult-pull-left">
				<span className="catapult-main-title">Rigor Catapult</span>
			</div>
			<div className="catapult-pull-right">
				<a target="_blank" className="catapult-faint-link" href={'/db/' + this.state.db_name + '/perceptsearch'}>Browse this db</a>
			</div>
			{/*  HACK: remove the database dropdown list
			<div className="catapult-pull-right">
				db:&nbsp;
				<select value={this.state.db_name}>
					{that.state.db_names.map(function(db_name) {
						return <option value={db_name} key={"dbdrop-" + db_name}>{db_name}</option>;
					})}
				</select>
			</div>
			*/}
		</div>;
	}
});

var SidebarPrevNext = React.createClass({
	getInitialState: function() {
		// subscribe to changes
		var that = this;
		RH.pageState.onChange('catapult.percept.id', function(id) {
			that.setState({id: id});
		});
		return {
			id: RH.pageState.get('catapult.percept.id'),
			db_name: RH.pageState.get('catapult.db_name'),
		};
	},
	render: function() {
		var id = this.state.id ? this.state.id : '';
		var url = '/db/' + this.state.db_name + '/percept/' + id;
		return <div className="catapult-sidebar-row centeredText">
			<input onClick={actions.prevPerceptButton} type="button" className="button" value="&larr; Prev" />
			<a target="_blank" href={url} className="catapult-between-nav-buttons">Image {id}</a>
			<input onClick={actions.nextPerceptButton} type="button" className="button" value="Next &rarr;" />
		</div>;
	}
});

var SidebarChosenCategories = React.createClass({
	getInitialState: function() {
		// subscribe to changes
		var that = this;
		RH.pageState.onChange('catapult.percept', function(percept) {
			that.setState({percept: percept});
		});
		return {percept: RH.pageState.get('catapult.percept')};
	},
	render: function() {
		var content = null;
		var that = this;
		if (nullOrUndefined(this.state.percept)) {
			return null;
			content = <div className="catapult-loading-sidebar">loading...</div>;
		} else if (nullOrUndefined(this.state.percept.categories) || Object.keys(this.state.percept.categories).length === 0) {
			content = <div className="catapult-no-pill">None yet</div>
		} else {
			var db_name = RH.pageState.get('catapult.db_name');
			content = Object.keys(this.state.percept.categories).map(function(category) {
				var isSaving = that.state.percept.categories[category] === true;
				var savingClass = isSaving ? ' catapult-pill-saving' : '';
				var searchUrl = '/db/' + db_name + '/perceptsearch?&annotation_domain='+RH.pageState.get('catapult.domain')+'&annotation_model=' + category
				return <div className={"catapult-pill" + savingClass} key={'catpill-' + category}>
					<a target="_blank" href={searchUrl} className="catapult-pill-text">{category}</a>
					<a href="#" className="catapult-pill-x" onClick={function() {actions.removeCategory(category)}}>&times;</a>
				</div>;
			});
		}
		return <div className="catapult-sidebar-row" style={{paddingBottom: '0px'}}>
			<div className="catapult-help-text-header">
				Things in this image
			</div>
			{content}
		</div>;
	}
});

var SidebarAutocompletingInput = React.createClass({
	getInitialState: function() {
		// subscribe to changes
		var that = this;
		RH.pageState.onChange('catapult.all_categories', function(allCategories) {
			that.setState({allCategories: allCategories});
		});
		RH.pageState.onChange('catapult.percept', function(percept) {
			that.setState({percept: percept});
		});
		return {
			allCategories: RH.pageState.get('catapult.all_categories'),
			selectedCategory: null,  // a string
			percept: RH.pageState.get('catapult.percept'),
			inputValue: '',
		};
	},
	_categoriesToList: function() {
		// which categories should appear in the drop-down list?
		var that = this;
		if (nullOrUndefined(this.state.percept)) {
			// still loading
			return [];
		}
		var chosenCategories = Object.keys(this.state.percept.categories);
		if (nullOrUndefined(chosenCategories)) { return []; }
		var inputWithUnderscores = this.state.inputValue.split(' ').join('_');
		return this.state.allCategories.filter(function(category) {
			// remove categories that have already been added to this percept
			if (chosenCategories.indexOf(category) !== -1) { return false; }
			// when input is blank, show everything
			if (that.state.inputValue === '') { return true; }
			// allow categories starting with input
			if (category.indexOf(inputWithUnderscores) === 0) { return true; }
			// allow categories which contain '_' + input
			if (category.indexOf('_' + inputWithUnderscores) !== -1) { return true; }
			return false;
		});
	},
	_moveSelection: function(delta) {
		// aka down-arrow or up-arrow press
		// delta is 1 or -1 indicating direction to move
		var categoriesToList = this._categoriesToList();
		if (categoriesToList.length === 0) { return; }
		if (nullOrUndefined(this.state.selectedCategory)) {
			// if no selection, select the first item
			if (delta === 1) {
				this.setState({selectedCategory: categoriesToList[0]});
			} else if (delta === -1) {
				this.setState({selectedCategory: categoriesToList[categoriesToList.length-1]});
			}
		} else {
			// find the next item after the selected one
			var ii = categoriesToList.indexOf(this.state.selectedCategory);
			if (ii === -1) { return; }
			ii = (ii + delta + categoriesToList.length) % categoriesToList.length;
			this.setState({selectedCategory: categoriesToList[ii]});
		}
		// TODO: scroll list to show selection
	},
	_submitSelection: function() {
		if (nullOrUndefined(this.state.selectedCategory)) { return; }
		actions.addCategory(this.state.percept.id, this.state.selectedCategory);
		this.setState({selectedCategory: null, inputValue: ''});
	},
	_onChangeInput: function(e) {
		var that = this;
		var newValue = e.target.value;

		// keyboard shortcuts for switching to next/prev percept.
		// since the input focus is on a text box, we catch these keys
		// by watching for them to be typed at the end of the input value
		if (newValue[newValue.length-1] === '>') {
			actions.nextPerceptButton();
			return;
		}
		if (newValue[newValue.length-1] === '<') {
			actions.prevPerceptButton();
			return;
		}

		this.setState({inputValue: newValue}, function() {
			var categoriesToList = that._categoriesToList();
			// if exactly one thing is in the suggestion list, select it
			if (categoriesToList.length === 1) {
				this.setState({selectedCategory: categoriesToList[0]});
				return;
			}
			// if the selected item has vanished from the list because of this input, select nothing
			if (categoriesToList.indexOf(this.state.selectedCategory) === -1) {
				this.setState({selectedCategory: null});
			}
		});
	},
	_onInputKeydown: function(e) {
		if (e.key == 'ArrowDown') { this._moveSelection(1); e.preventDefault(); }
		else if (e.key == 'ArrowUp') { this._moveSelection(-1); e.preventDefault(); }
		else if (e.key == 'Enter') { this._submitSelection(); e.preventDefault(); }
	},
	_onClickCategory: function(category) {
		// user has clicked something in the dropdown list
		actions.addCategory(this.state.percept.id, category);
		this.setState({inputValue: '', selectedCategory: null});
	},
	_focusInput: function() {
		if (this.refs.catapultBigInput !== undefined) {
			this.refs.catapultBigInput.getDOMNode().focus();
		}
	},
	_onMouseoverCategory: function(category) {
		RH.pageState.set('catapult.category_to_show_help_for', category);
	},
	componentDidMount: function() {
		this._focusInput();
	},
	componentDidUpdate: function() {
		this._focusInput();
	},
	componentWillUpdate: function(nextProps, nextState) {
		var that=this;
		// when switching to a new percept, clear the input box
		if (nullOrUndefined(this.state.percept)) { return; }
		if (this.state.percept.id !== nextState.percept.id && this.state.inputValue !== '') {
			this.setState({inputValue: '', selectedCategory: null});
		}
		// when the selection has changed, show help for that category
		RH.pageState.set('catapult.category_to_show_help_for', nextState.selectedCategory);
		// scroll to selection
		// need a setTimeout to give React a chance to render to the DOM first
		if (!nullOrUndefined(nextState.selectedCategory)) {
			setTimeout(function() {
				var elem = that.refs[nextState.selectedCategory];
				if (!nullOrUndefined(elem)) {
					elem.getDOMNode().scrollIntoView(false);
				}
			}, 1);
		}
	},
	render: function() {
		var that = this;
		if (nullOrUndefined(this.state.percept) || this.state.percept.id === -1) {
			// still loading
			return null;
		}
		var categoriesToList = this._categoriesToList();
		return <div className="catapult-sidebar-row" style={{paddingTop: '0px'}}>
			<input type="text"
				ref="catapultBigInput"
				className="catapult-big-input"
				value={this.state.inputValue}
				onChange={this._onChangeInput}
				onKeyDown={this._onInputKeydown}
				/>
			<div className="catapult-completion-list" ref="completionList">
				{categoriesToList.map(function(category) {
					var className = 'catapult-completion-list-item';
					if (category === that.state.selectedCategory) {
						className += ' catapult-completion-list-item-selected';
					}
					return <div className={className} key={"allcatlist-" + category}
						onClick={that._onClickCategory.bind(that, category)}
						onMouseOver={that._onMouseoverCategory.bind(that, category)}
						ref={category}
						>
						{category}
					</div>;
				})}
			</div>
		</div>;
	}
});

var SidebarInstructions = React.createClass({
	getInitialState: function() {
		// subscribe to changes
		var that = this;
		RH.pageState.onChange('catapult.percept', function(percept) {
			that.setState({percept: percept});
		});
		RH.pageState.onChange('catapult.category_to_show_help_for', function(cat) {
			that.setState({categoryToShowHelpFor: cat});
		});
		return {
			percept: RH.pageState.get('catapult.percept'),
			categoryToShowHelpFor: RH.pageState.get('catapult.category_to_show_help_for'),
		};
	},
	render: function() {
		var title, body;
		var help = RH.pageState.get('catapult.categories_do_not_include');
		if (nullOrUndefined(this.state.percept) || this.state.percept.id === -1 || nullOrUndefined(this.state.categoryToShowHelpFor)) {
			title = 'Instructions';
			body = 'Add tags to describe the objects in each image.  Remember the "background" and "unmatchable" tags.';
		} else {
			title = '"' + this.state.categoryToShowHelpFor + '" does NOT include:';
			body = help[this.state.categoryToShowHelpFor];
			if (nullOrUndefined(body)) { body = ''; }
		}
		return <div className="catapult-sidebar-row">
			<div className="catapult-help-text-header">{title}</div>
			<div className="catapult-help-text-body">{body}&nbsp;</div>
			<div className="catapult-help-text-header">Keyboard shortcuts</div>
			<div className="catapult-help-text-body"><b>&lt;</b> previous image</div>
			<div className="catapult-help-text-body"><b>&gt;</b> next image</div>
		</div>;
	}
});

//============================================================================================
// GLOBAL KEYBOARD SHORTCUTS

Mousetrap.bind('>', function(e) {
	console.log('mousetrap >');
	actions.jumpForwardOrBack(1);
	return false;
});

Mousetrap.bind('<', function(e) {
	console.log('mousetrap >');
	actions.jumpForwardOrBack(-1);
	return false;
});

//============================================================================================
// MOUNT AND TRIGGER INITIAL AJAX LOAD

//setTimeout(actions.loadMorePerceptsIfNeeded, 5000);  // HACK to test UI on slow loads
actions.loadMorePerceptsIfNeeded();

// mount the master React component
var targetId = 'catapult-react-slot';
var targetElem = document.getElementById(targetId);
if (targetElem) {
	React.render(<CatapultMaster />, targetElem);
}

})();
