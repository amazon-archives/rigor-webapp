'use strict';

(function() {

var RH = require('/rigorhub.js');
var API = window.API;  // provided by the "api" plugin

/* Page state created by this plugin:
 *   percept_annotations: {
 *       selected_annotation_id  // undefined, or id of currently selected annotation
 *       show_annotation_boxes  // defaults to true
 *   }
 * Also modifies percept_detail_page.percept.annotations
 * Briefly adds a boolean "pending" property to annotations while waiting
 * for AJAX to complete.
 */

// mapping from domain --> template.
// special template values:
//     {model}
//     {db}
//     {perceptId} // todo
//     {annotationId} // todo
//     {domain} // todo
/*
var externalLinkTemplates = {
	category: 'http://example.com/{db}/{model}',
};*/
var externalLinkTemplates = RH.pageState.get('percept_annotations.external_link_templates');

var makeExternalLink = function(annotation) {
	var template = externalLinkTemplates[annotation.domain];
	if (template === undefined) { return ''; }
	return template
		.replace('{model}', annotation.model)
		.replace('{db}', RH.pageState.get('percept_detail_page.db_name'));
};

var getUrlDomain = function(url) {
	// given a full url like "http://www.example.com/foo/bar"
	// return just the domain "www.example.com"
	return url
		.replace('http://', '')
		.replace('https://', '')
		.split('/')[0];
};

//================================================================================
// HELPERS

var getAnnotationById = function(annotations, id) {
	for (var ii = 0; ii < annotations.length; ii++) {
		if (annotations[ii].id === id) {
			return annotations[ii];
		}
	}
	return undefined;
}

var normalizeDir = function(d) {
	// input: an [x,y] array
	// output: new array with distance from origin normalized to 1
	// if input is [0,0], return [0,0]
	var x = d[0]; var y = d[1];
	var dist = Math.sqrt(x*x + y*y);
	if (dist === 0) { return [0, 0]; }
	return [x / dist, y / dist];
}

var modifyAnnotationById = function(annotationId, callback) {
	// Given the id of a boundary, run callback(annotation).
	// The callback should return the new version of the annotation or null to delete the given annotation.
	// It's ok to mutate the annotation in the callback and return it.
	
	var annotations = RH.pageState.get('percept_detail_page.percept.annotations');

	annotations = annotations.map(function(a) {
		return (a.id === annotationId) ? callback(a) : a;
	});

	// remove nulls and undefineds from the annotations list
	// in case the callback returned nothing
	annotations = annotations.filter(function(a) {
		return a !== null && a !== undefined;
	});

	RH.pageState.set('percept_detail_page.percept.annotations', annotations);
};

//================================================================================
// SIDEBAR

var keyboardShortcuts = {
	delete: {key: 'x', help: 'Delete'},
	duplicate: {key: 'd', help: 'Duplicate'},
	rotateCW: {key: '>', help: 'Rotate CW'},
	rotateCCW: {key: '<', help: 'Rotate CCW'},
	flip: {key: 'f', help: 'Flip'},
};

var PerceptAnnotationSidebar = React.createClass({
	/*	Render a list of annotations.
	 *	Most will be rendered as <PerceptAnnotationDetailsCondensed />.
	 *	The selected one will be <PerceptAnnotationDetailsExpanded />.
	 */
	getInitialState: function() {
		var that = this;
		// set defaults
		if (RH.pageState.get('percept_annotations.show_annotation_boxes') === undefined) {
			RH.pageState.set('percept_annotations.show_annotation_boxes', true);
		}
		// subscribe to changes
		RH.pageState.onChange('percept_detail_page.percept.annotations', function(annotations) {
			that.setState({annotations: annotations});
		});
		RH.pageState.onChange('percept_annotations.selected_annotation_id', function(annotationId) {
			that.setState({selectedAnnotationId: annotationId});
		});
		RH.pageState.onChange('percept_annotations.show_annotation_boxes', function(showBoxes) {
			that.setState({showAnnotationBoxes: showBoxes});
		});
		// return initial values
		return {
			annotations: RH.pageState.get('percept_detail_page.percept.annotations'),
			selectedAnnotationId: RH.pageState.get('percept_annotations.selected_annotation_id'),
			showAnnotationBoxes: RH.pageState.get('percept_annotations.show_annotation_boxes'),
		};
	},
	_toggleBoxes: function() {
		RH.pageState.set('percept_annotations.show_annotation_boxes', !this.state.showAnnotationBoxes);
	},
	_deleteSelected: function() {
		var that = this;
		// ask the API to delete the selected annotation from the server
		var dbName = RH.pageState.get('percept_detail_page.db_name');
		API.deleteAnnotation(dbName, this.state.selectedAnnotationId, function(err, response) {
			if (err) {
				console.log('PerceptAnnotationSidebar error in _deleteSelected');
				console.log(err);
			}
		});
		// delete from client-side pageState without waiting for AJAX to finish
		modifyAnnotationById(this.state.selectedAnnotationId, function(a) {
			return null;
		});
		// select nothing
		// TODO: select the next annotation
		RH.pageState.set('percept_annotations.selected_annotation_id', undefined);
	},
	_duplicateSelected: function() {
		var that = this;
		if (this.state.selectedAnnotationId === undefined) { return; }
		// get the annotation we want to duplicate
		var annotationToCopy = undefined;
		for (var ii = 0; ii < this.state.annotations.length; ii++) {
			if (this.state.annotations[ii].id === this.state.selectedAnnotationId) {
				annotationToCopy = this.state.annotations[ii];
			}
		}
		if (annotationToCopy === undefined) { return; }
		// update it with new values
		var copiedAnnotation = JSON.parse(JSON.stringify(annotationToCopy));
		copiedAnnotation.id = -((new Date()).getTime());  // server will send us back a real id after the ajax finishes
		copiedAnnotation.stamp = Math.floor((new Date()).getTime() / 1000);
		copiedAnnotation.pending = true;
		if (copiedAnnotation.boundary != null) {
			// shift the boundary over a few pixels so we can see that something happened
			copiedAnnotation.boundary = copiedAnnotation.boundary.map(function(coord) {
				return [coord[0] + 10, coord[1] + 10];
			});
		}
		// update client-side pageState
		RH.pageState.set('percept_detail_page.percept.annotations', this.state.annotations.concat(copiedAnnotation));
		// select new copy
		RH.pageState.set('percept_annotations.selected_annotation_id', copiedAnnotation.id);
		// save to server
		var dbName = RH.pageState.get('percept_detail_page.db_name');
		API.createAnnotation(dbName, copiedAnnotation, function(err, newId) {
			if (err) {
				console.log('PerceptAnnotationSidebar error in _duplicateSelected');
				console.log(err);
			} else {
				// we got the new id back from the server
				// stash it in the new annotation we just saved
				modifyAnnotationById(copiedAnnotation.id, function(a) {
					a.id = newId;
					delete a.pending;
					return a;
				});
				// re-select the annotation now that its id has changed
				RH.pageState.set('percept_annotations.selected_annotation_id', newId);
			}
		});
	},
	_rotateVertsCW: function() {
		var that = this;
		modifyAnnotationById(this.state.selectedAnnotationId, function(a) {
			a.boundary.push(a.boundary.shift());
			a.pending = true;
			// save to server
			var dbName = RH.pageState.get('percept_detail_page.db_name');
			API.setAnnotationField(dbName, a.id, 'boundary', a.boundary, function(err, data) {
				if (err) {
					console.log('PerceptAnnotationSidebar error in _rotateVertsCW');
					console.log(err);
				}
				modifyAnnotationById(that.state.selectedAnnotationId, function(aa) {
					delete aa.pending;
					return aa;
				});
			});
			return a;
		});
	},
	_rotateVertsCCW: function() {
		var that = this;
		modifyAnnotationById(this.state.selectedAnnotationId, function(a) {
			a.boundary.unshift(a.boundary.pop());
			a.pending = true;
			// save to server
			var dbName = RH.pageState.get('percept_detail_page.db_name');
			API.setAnnotationField(dbName, a.id, 'boundary', a.boundary, function(err, data) {
				if (err) {
					console.log('PerceptAnnotationSidebar error in _rotateVertsCCW');
					console.log(err);
				}
				modifyAnnotationById(that.state.selectedAnnotationId, function(aa) {
					delete aa.pending;
					return aa;
				});
			});
			return a;
		});
	},
	_flipVerts: function() {
		var that = this;
		modifyAnnotationById(this.state.selectedAnnotationId, function(a) {
			if (a.boundary.length !== 4) { return a; }
			a.pending = true;
			a.boundary = [a.boundary[1], a.boundary[0], a.boundary[3], a.boundary[2]];
			// save to server
			var dbName = RH.pageState.get('percept_detail_page.db_name');
			API.setAnnotationField(dbName, a.id, 'boundary', a.boundary, function(err, data) {
				if (err) {
					console.log('PerceptAnnotationSidebar error in _flipVerts');
					console.log(err);
				}
				modifyAnnotationById(that.state.selectedAnnotationId, function(aa) {
					delete aa.pending;
					return aa;
				});
			});
			return a;
		});
	},
	componentDidMount: function() {
		var that = this;
		Mousetrap.bind(keyboardShortcuts.delete.key, function() {
			that._deleteSelected();
			return false;
		});
		Mousetrap.bind(keyboardShortcuts.duplicate.key, function() {
			that._duplicateSelected();
			return false;
		});
		Mousetrap.bind(keyboardShortcuts.rotateCW.key, function() {
			that._rotateVertsCW();
			return false;
		});
		Mousetrap.bind(keyboardShortcuts.rotateCCW.key, function() {
			that._rotateVertsCCW();
			return false;
		});
		Mousetrap.bind(keyboardShortcuts.flip.key, function() {
			that._flipVerts();
			return false;
		});
	},
	render: function() {
		var that = this;
		var showAnnotationButtons = that.state.selectedAnnotationId !== undefined && that.state.selectedAnnotationId !== null;
		var selectedAnnotation = getAnnotationById(this.state.annotations, this.state.selectedAnnotationId);
		var enableAnnotationButtons = selectedAnnotation && !selectedAnnotation.pending;
		return <div>
			<div id="annotationScrollingList" className="annotationScrollingList">
				{this.state.annotations.map(function(annotation, ii) {
					var className = 'sidebarSectionRow';
					var innerElem = null;
					if (annotation.id === that.state.selectedAnnotationId) {
						className += ' sidebarSectionRowSelected';
						innerElem = <PerceptAnnotationDetailsExpanded
							annotation={annotation}
							index={ii}
						/>;
					} else {
						innerElem = <PerceptAnnotationDetailsCondensed annotation={annotation} />;
					}
					return <div className={className}>
						{innerElem}
					</div>;
				})}
			</div>
			<div className="sidebarSectionTitle">
				Actions
			</div>
			<div className="sidebarSectionRow">
				<input
					type="button"
					className="button"
					style={{margin: "3px"}}
					value={that.state.showAnnotationBoxes ? "Hide boxes" : "Show boxes"}
					onClick={that._toggleBoxes.bind(that)}
					/>
				<input
					type="button"
					className="button"
					style={{display: showAnnotationButtons ? undefined : "none", margin: "3px"}}
					value="Delete"
					onClick={that._deleteSelected.bind(that)}
					disabled={!enableAnnotationButtons}
					/>
				<input
					type="button"
					className="button"
					style={{display: showAnnotationButtons ? undefined : "none", margin: "3px"}}
					value="Duplicate"
					onClick={that._duplicateSelected.bind(that)}
					disabled={!enableAnnotationButtons}
					/>
				<input
					type="button"
					className="button"
					style={{display: showAnnotationButtons ? undefined : "none", margin: "3px"}}
					value="Rotate CCW"
					onClick={that._rotateVertsCCW.bind(that)}
					disabled={!enableAnnotationButtons}
					/>
				<input
					type="button"
					className="button"
					style={{display: showAnnotationButtons ? undefined : "none", margin: "3px"}}
					value="Rotate CW"
					onClick={that._rotateVertsCW.bind(that)}
					disabled={!enableAnnotationButtons}
					/>
				<input
					type="button"
					className="button"
					style={{display: showAnnotationButtons ? undefined : "none", margin: "3px"}}
					value="Flip"
					onClick={that._flipVerts.bind(that)}
					disabled={!enableAnnotationButtons}
					/>
			</div>
			<PerceptAnnotationKeyboardShortcuts />
		</div>;
	},
});

var PerceptAnnotationKeyboardShortcuts = React.createClass({
	getInitialState: function() {
		return {show: false};
	},
	_toggle: function() {
		this.setState({show: !this.state.show});
	},
	render: function() {
		if (this.state.show === true) {
			return (
				<div>
					<div className="sidebarSectionTitle">
						Keyboard shortcuts
					</div>
					{Object.keys(keyboardShortcuts).map(function(k) {
						var key = keyboardShortcuts[k].key;
						var help = keyboardShortcuts[k].help;
						return <div className="sidebarSectionRow">
							<div className="sidebarSectionRowLabel">{key}</div>
							<div className="sidebarSectionRowValue">{help}</div>
						</div>;
					})}
				</div>
			);
		} else {
			return (
				<div>
					<div className="sidebarSectionTitle">
						Keyboard shortcuts&nbsp;
						<a href="#" onClick={this._toggle}>
							(show)
						</a>
					</div>
				</div>
			);
		}
	},
});

var PerceptAnnotationDetailsCondensed = React.createClass({
	/* Display a single-line summary of an annotation including its domain and model.
	 */
	getDefaultProps: function() {
		return {annotation: null};
	},
	render: function() {
		var that = this;
		var externalLink = makeExternalLink(that.props.annotation);
		return (
			<div
				id={'annotationSidebar-'+this.props.annotation.id}
				key={'key-'+this.props.annotation.id}
				onClick={function() {
					RH.pageState.set('percept_annotations.selected_annotation_id', that.props.annotation.id);
				}}
				>

				<div className="sidebarSectionRowLabel">{this.props.annotation.domain}</div>
				<div className="sidebarSectionRowValue">
					{ externalLink
						// stopPropagation here allows clicks on the link to navigate the browser
						// without opening up the collapsed annotation row
						? <a href={externalLink} onClick={function(e) { e.stopPropagation(); }}>{this.props.annotation.model}</a>
						: this.props.annotation.model
					}
				</div>
			</div>
		);
	},
});

var coerceString = function(value, type) {
	/* Converts a string (value) to a given type.
	 * Type must be one of "string", "int".
	 * Throws an error if can't convert.
	 */
	if (type === 'string') {
		return value;
	} else if (type === 'int') {
		var result = +value;  // coerce string to number
		if (isNaN(result)) {
			throw {
				name: 'Coerce String Error',
				message: 'Could not convert string to integer: ' + value,
			};
		} else {
			return result;
		}
	}
	throw {
		name: 'Coerce String Error',
		message: 'Unknown type: ' + type,
	};
};

var PerceptAnnotationDetailsExpanded = React.createClass({
	/* Display an expanded view of all the details, tags, and properties of an annotation.
	 * Allow editing.
	 */
	getDefaultProps: function() {
		return {
			annotation: null,
			index: null,  // the index of this annotation in the percept's annotation list
		};
	},
	getInitialState: function() {
		return {
			modifiedFields: {},  // for each field in annotation, true or false/absent
		};
	},
	_changeField: function(e, field) {
		// Handle a keypress or other change to a text field.
		
		// On every keypress, update pageState.
		// Validate and coerce the field on every keypress.
		// This is not ideal because it's hard to enter certain values which require multiple keypresses to get to a valid state.
		// To fix this we would need to keep the string version around as well as the coerced version.
		
		var newValue = e.target.value;
		var coercedValue = undefined;
		try {
			coercedValue = coerceString(newValue, field.type);
		} catch (err) {
		}
		if (coercedValue !== undefined) {
			window.onbeforeunload = function(e) {
				return "You have unsaved changes in a text field.  Text fields only save themselves when you tab away from them.";
			};
			API.adviseOfUnsavedData();
			RH.pageState.set('percept_detail_page.percept.annotations.' + this.props.index + '.' + field.name, coercedValue);
			this.state.modifiedFields[field.name] = true;
			this.setState({modifiedFields: this.state.modifiedFields});
		}
	},
	_saveFieldIfChanged: function(field) {
		// When the user leaves the field, submit the value to the server if it has been modified.
		var dbName = RH.pageState.get('percept_detail_page.db_name');
		if (this.state.modifiedFields[field.name]) {
			window.onbeforeunload = undefined;
			API.setAnnotationField(dbName, this.props.annotation.id, field.name, this.props.annotation[field.name], function(err, data) {
				if (err) {
					console.log('PerceptAnnotationDetailsExpanded error in _saveFieldIfChanged');
					console.log(err);
				}
			});
			this.state.modifiedFields[field.name] = false;
			this.setState({modifiedFields: this.state.modifiedFields});
		}
	},
	render: function() {
		var that = this;
		var metadataFields = [
			{ name: 'domain', editable: true, type: 'string'},
			{ name: 'model', editable: true, type: 'string'},
			{ name: 'id', editable: false, },
			{ name: 'confidence', editable: true, type: 'int'},
		];
		var externalLink = makeExternalLink(that.props.annotation);
		return <div className="sidebarSectionRowNestedGroup"
				id={'annotationSidebar-'+this.props.annotation.id}
				key={'key-'+this.props.annotation.id}
			>
			<form onSubmit={function(e) {
				e.preventDefault();
				console.log('submitted');
			}}>
				<div className="sidebarSectionTitle">
					Metadata
				</div>
				{metadataFields.map(function(field) {
					if (field.editable) {
						var valueElem = (
							<input
								className="sidebarSectionRowValue"
								type="text"
								value={that.props.annotation[field.name]}
								onChange={function(e) { that._changeField(e, field); }}
								onBlur={function(e) { that._saveFieldIfChanged(field); }}
							/>
						);
					} else {
						var valueElem = (
							<div className="sidebarSectionRowValue">
								{that.props.annotation[field.name]}
							</div>
						);
					}
					return <div className="sidebarSectionRow" key={'key-' + field.name}>
						<div className="sidebarSectionRowLabel">{field.name}</div>
						{valueElem}
					</div>;
				})}
				<div className="sidebarSectionTitle">
					Tags
				</div>
				<div className="sidebarSectionRow">
					{(this.props.annotation.tags || []).map(function(tag) {
						// TODO: need to port the python tag coloring algorithm to js.  rigorwebapp.utils.hash_string_to_hue
						return <div className="tag" style={{background: 'hsl(0,25%,50%)'}}>{tag}</div>;
					})}
				</div>
				<div className="sidebarSectionTitle">
					Properties
				</div>
				{Object.keys(this.props.annotation.properties || {}).map(function(key) {
					return <div className="sidebarSectionRow">
						<div className="sidebarSectionRowLabel">{key}</div>
						<div className="sidebarSectionRowValue">{that.props.annotation.properties[key]}</div>
					</div>;
				})}
				{ externalLink
					? <div className="sidebarSectionTitle">External Link</div>
					: null
				}
				{ externalLink
					? <div className="sidebarSectionRow">
						<div className="sidebarSectionRowValue"><a href={externalLink}>{getUrlDomain(externalLink)}</a></div>
					</div>
					: null
				}
			</form>
		</div>;
	},
});

//================================================================================
// ANNOTATION BOUNDARIES

var PerceptAnnotationSvg = React.createClass({
	getInitialState: function() {
		var that = this;
		RH.pageState.onChange('percept_detail_page.percept', function(percept) {
			that.setState({percept: percept});
		});
		RH.pageState.onChange('percept_annotations.selected_annotation_id', function(annotationId) {
			that.setState({selectedAnnotationId: annotationId});
		});
		RH.pageState.onChange('percept_annotations.show_annotation_boxes', function(showBoxes) {
			that.setState({showAnnotationBoxes: showBoxes});
		});
		var state = this._getClearDraggingState();
		state.percept = RH.pageState.get('percept_detail_page.percept');
		state.selectedAnnotationId = RH.pageState.get('percept_annotations.selected_annotation_id');
		state.showAnnotationBoxes = RH.pageState.get('percept_annotations.show_annotation_boxes');
		return state;
	},
	_boundaryArrayToSvgString: function(boundary) {
		/* boundary is a nested list of arrays like [[x0, y0], [x1, y1], ...]
		 * return a string like 'x0,y0 x1,y1 ...' for use in svg polygon
		 */
		return JSON.stringify(boundary)
			.split('[').join('')
			.split('],').join(' ')
			.split(']').join('');
	},
	_onClickOnAnnotation: function(annotation) {
		// click on an annotation to select it
		// if selected already, ignore the click
		if (RH.pageState.get('percept_annotations.selected_annotation_id') === annotation.id) { return; }
		// not already selected; select it
		RH.pageState.set('percept_annotations.selected_annotation_id', annotation.id);
		// then scroll sidebar to show newly selected annotation
		// this has to be in a setTimeout to give React time to redraw the sidebar before we scroll it
		setTimeout(function() {
			var sidebarMainElem = document.getElementById('annotationScrollingList');
			var sidebarChildElem = document.getElementById('annotationSidebar-' + annotation.id);
			if (sidebarMainElem && sidebarChildElem) {
				sidebarMainElem.scrollTop = sidebarChildElem.offsetTop - 5;
			}
		}, 0);
	},
	_getClearDraggingState: function() {
		return {
			dragging: false,  // is the mouse button down right now?
			draggingNeedsSave: false,  // has the mouse moved since going down?
			draggingAnnotationI: -1,  // which annotation are we dragging?
			draggingStartMousePos: [-1, -1],  // where was the mouse when it went down?
			draggingStartBoundary: null,  // the whole boundary at the time the mouse went down
			draggingHandleIs: [],  // which handle(s) are being draggd?  not used in whole-box or new-annotation dragging
			draggingNewAnnotation: false,  // true when dragging new box on empty space
			draggingWholeAnnotation: false,  // true when dragging the box itself, not a handle
		};
	},
	_onMouseDownOnBackground: function(e) {
		// create new annotation, select it, and begin dragging in rubberband mode
		var boundingClientRect = e.target.getBoundingClientRect();
		var top = boundingClientRect.top;
		var left = boundingClientRect.left;
		var newAnnotation = {
			boundary: [[e.clientX - left, e.clientY - top], [e.clientX - left, e.clientY - top], [e.clientX - left, e.clientY - top], [e.clientX - left, e.clientY - top]],
			confidence: 1,
			domain: "undefined",
			id: -((new Date()).getTime()),  // server will send us back a real id after the ajax finishes
			model: "",
			percept_id: this.state.percept.id,
			properties: {},
			stamp: Math.floor((new Date()).getTime() / 1000),
			tags: [],
		};
		// add to the pageState
		var newAnnotations = JSON.parse(JSON.stringify(this.state.percept.annotations));
		newAnnotations.push(newAnnotation);
		RH.pageState.set('percept_detail_page.percept.annotations', newAnnotations);
		// select the new annotation
		RH.pageState.set('percept_annotations.selected_annotation_id', newAnnotation.id);
		// set up dragging
		this.setState({
			dragging: true,
			draggingNeedsSave: false,
			draggingAnnotationI: newAnnotations.length - 1,
			draggingStartMousePos: [e.pageX, e.pageY],
			draggingStartBoundary: newAnnotation.boundary,
			draggingHandleIs: [],
			draggingNewAnnotation: true,
			draggingWholeAnnotation: false,
		});
	},
	_onMouseDownOnAnnotation: function(e, annotation) {
		// begin dragging whole annotation if it's already selected
		if (annotation.pending) { return }
		if (RH.pageState.get('percept_annotations.selected_annotation_id') === annotation.id) {
			this.setState({
				dragging: true,
				draggingAnnotationI: this.state.percept.annotations.indexOf(annotation),
				draggingStartMousePos: [e.pageX, e.pageY],
				draggingStartBoundary: annotation.boundary,
				draggingHandleIs: [],
				draggingNewAnnotation: false,
				draggingWholeAnnotation: true,
			});
		}
	},
	_onMouseDownOnHandle: function(e, annotation, handleIs) {
		// begin dragging handle(s) of the selected annotation
		// handleIs should be an array of handle indices
		if (annotation.pending) { return }
		this.setState({
			dragging: true,
			draggingAnnotationI: this.state.percept.annotations.indexOf(annotation),
			draggingStartMousePos: [e.pageX, e.pageY],
			draggingStartBoundary: annotation.boundary,
			draggingHandleIs: handleIs,
			draggingNewAnnotation: false,
			draggingWholeAnnotation: false,
		});
	},
	_onMouseMove: function(e) {
		// handle a mouse move over the svg
		
		// if not dragging or mouse hasn't moved yet, do nothing
		if (!this.state.dragging) { return; }
		var dx = e.pageX - this.state.draggingStartMousePos[0];
		var dy = e.pageY - this.state.draggingStartMousePos[1];
		if (dx === 0 && dy === 0) { return; }

		var newBoundary;
		if (this.state.draggingNewAnnotation) {
			// rubber-banding a new box
			// don't allow rubber-banding a tiny box since it's likely to be a mistake
			if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { return; }
			var startX = this.state.draggingStartBoundary[0][0];
			var startY = this.state.draggingStartBoundary[0][1];
			var minX = Math.min(startX, startX + dx);
			var maxX = Math.max(startX, startX + dx);
			var minY = Math.min(startY, startY + dy);
			var maxY = Math.max(startY, startY + dy);
			newBoundary = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
		} else if (this.state.draggingWholeAnnotation) {
			// moving entire box
			newBoundary = this.state.draggingStartBoundary.map(function(oldPoint) {
				return [oldPoint[0] + dx, oldPoint[1] + dy];
			});
		} else {
			// just moving one or two handles
			// make a fresh copy of the boundary array with only this one coordinate changed
			newBoundary = JSON.parse(JSON.stringify(this.state.draggingStartBoundary));
			for (var ii = 0; ii < this.state.draggingHandleIs.length; ii++) {
				var handleI = this.state.draggingHandleIs[ii];
				var newHandlePosX = this.state.draggingStartBoundary[handleI][0] + dx;
				var newHandlePosY = this.state.draggingStartBoundary[handleI][1] + dy;
				newBoundary[handleI] = [newHandlePosX, newHandlePosY];
			}
		}
		RH.pageState.set('percept_detail_page.percept.annotations.' + this.state.draggingAnnotationI + '.boundary', newBoundary);
		this.setState({draggingNeedsSave: true});
	},
	_completeDragging: function(e) {
		var that = this;
		if (!this.state.dragging) { return; }
		var needsSave = this.state.draggingNeedsSave;
		var draggingAnnotationI = this.state.draggingAnnotationI;
		var draggingNewAnnotation = this.state.draggingNewAnnotation;
		var annoThatWasDragged = this.state.percept.annotations[draggingAnnotationI];
		this.setState(this._getClearDraggingState());
		// is this an ignorable mouseUp?
		if (!needsSave) {
			if (draggingNewAnnotation) {
				// delete this annotation (client-side).  probably didn't mean to create it
				modifyAnnotationById(this.state.selectedAnnotationId, function(a) { return null; });
				// select nothing
				// TODO: select the next annotation
				RH.pageState.set('percept_annotations.selected_annotation_id', undefined);
			}
			return; 
		}
		// when user drops the handle or annotation box, save to the server
		var dbName = RH.pageState.get('percept_detail_page.db_name');
		if (draggingNewAnnotation) {
			// this is a newly created annotation
			annoThatWasDragged.pending = true;
			API.createAnnotation(dbName, annoThatWasDragged, function(err, newId) {
				if (err) {
					console.log('PerceptAnnotationSvg error in _completeDragging new annotation');
					console.log(err);
				} else {
					// we got the new id back from the server
					// stash it in the new annotation we just saved
					modifyAnnotationById(annoThatWasDragged.id, function(a) {
						a.id = newId;
						delete a.pending;
						return a;
					});
					// re-select the annotation now that its id has changed
					RH.pageState.set('percept_annotations.selected_annotation_id', newId);
				}
			});
		} else {
			// this is a modified existing annotation
			API.setAnnotationField(dbName, annoThatWasDragged.id, 'boundary', annoThatWasDragged.boundary, function(err, data) {
				if (err) {
					console.log('PerceptAnnotationSvg error in _completeDragging existing annotation');
					console.log(err);
				}
			});
		}
	},
	render: function() {
		var that = this;
		if (!this.state.showAnnotationBoxes) {
			return null;
		}

		// SVG elements are rendered in the order they occur in the markup -- first on the bottom.
		// Sort the annotations smallest-last so the small ones are rendered on top of the big ones.
		var sortedAnnotations = [];
		this.state.percept.annotations.forEach(function(annotation) {
			sortedAnnotations.push(annotation);
			if (annotation.boundary == null) {
				annotation.zIndex = 0;
			} else {
				annotation.zIndex = - Math.abs(annotation.boundary[0][0] - annotation.boundary[1][0]) - Math.abs(annotation.boundary[0][1] - annotation.boundary[1][1]);
			}
		});
		sortedAnnotations.sort(function(a, b) {
			if (a.zIndex < b.zIndex) { return -1; }
			else if (a.zIndex > b.zIndex) { return 1; }
			return 0;
		});
		sortedAnnotations.forEach(function(annotation) {
			delete annotation.zIndex;
		});

		// find selected annotation
		var selectedAnnotation = null;
		sortedAnnotations.forEach(function(annotation) {
			if (annotation.id === that.state.selectedAnnotationId) {
				selectedAnnotation = annotation;
			}
		});

		// build handles for selected annotation
		var makeSvgCornerHandle = function(annotation, handleI) {
			/* Return the svg element for a handle for the handleI'th vertex of the annotation's boundary.
			 */
			var radius = 6;
			var xc = annotation.boundary[handleI][0];
			var yc = annotation.boundary[handleI][1];
			var handlePoints = [
				[xc + radius, yc + radius],
				[xc + radius, yc - radius],
				[xc - radius, yc - radius],
				[xc - radius, yc + radius],
			];
			var pendingClassname = annotation.pending === true ? ' annotationPolygonPending' : '';
			return <polygon
				className={'annotationHandle annotationHandle' + handleI + pendingClassname}
				points={that._boundaryArrayToSvgString(handlePoints)}
				key={'anno-corner-handle-' + annotation.id + '-' + handleI}
				onMouseDown={function(e) { that._onMouseDownOnHandle(e, annotation, [handleI]); }}
			/>;
		};
		var makeSvgSideHandle = function(annotation, handleI) {
			/* Return the svg element for a handle for the edge between handleI and handleI+1 (mod n).
			 */
			var handleI2 = (handleI + 1) % annotation.boundary.length;
			var offsetDist = 7;
			var radius = 5;
			// offset outward from the edge
			var dir = normalizeDir([
					annotation.boundary[handleI][0] - annotation.boundary[handleI2][0],
					annotation.boundary[handleI][1] - annotation.boundary[handleI2][1],
			]);
			var offsetX = -dir[1] * offsetDist;
			var offsetY = dir[0] * offsetDist;
			var xc = offsetX + (annotation.boundary[handleI][0] + annotation.boundary[handleI2][0])/2;
			var yc = offsetY + (annotation.boundary[handleI][1] + annotation.boundary[handleI2][1])/2;
			var handlePoints = [
				[xc + radius, yc + radius],
				[xc + radius, yc - radius],
				[xc - radius, yc - radius],
				[xc - radius, yc + radius],
			];
			var pendingClassname = annotation.pending === true ? ' annotationPolygonPending' : '';
			return <polygon
				className={'annotationSideHandle' + pendingClassname}
				points={that._boundaryArrayToSvgString(handlePoints)}
				key={'anno-side-handle-' + annotation.id + '-' + handleI}
				onMouseDown={function(e) { that._onMouseDownOnHandle(e, annotation, [handleI, handleI2]); }}
			/>;
		};
		var selectedAnnotationSvgHandles = [];
		if (selectedAnnotation != null && selectedAnnotation.boundary != null) {
			selectedAnnotation.boundary.forEach(function(coord, handleI) {
				selectedAnnotationSvgHandles.push(makeSvgCornerHandle(selectedAnnotation, handleI));
				selectedAnnotationSvgHandles.push(makeSvgSideHandle(selectedAnnotation, handleI));
			});
		}

		return (
			<svg
				width={this.state.percept.x_size}
				height={this.state.percept.y_size}
				onMouseMove={this._onMouseMove}
				onMouseLeave={this._completeDragging}
				onMouseUp={this._completeDragging}
				>
				{/* invisible rect covering the whole image allows us to catch "deselect" clicks */}
				<rect x="0" y="0"
					className='annotationInvisibleSvgElement'
					width={this.state.percept.x_size}
					height={this.state.percept.y_size}
					onMouseDown={this._onMouseDownOnBackground}
				/>
				{sortedAnnotations.map(function(annotation) {
					// draw main annotation boxes
					// skip annotations with no boundary
					if (annotation.boundary == null) { return null; }
					var className = 'annotationPolygon';
					if (annotation.id === that.state.selectedAnnotationId) {
						className += ' annotationPolygonSelected';
					}
					if (annotation.pending === true) {
						className += ' annotationPolygonPending';
					}
					return <polygon
						className={className}
						points={that._boundaryArrayToSvgString(annotation.boundary)}
						key={"anno-box-"+annotation.id}
						onMouseDown={function(e) { that._onMouseDownOnAnnotation(e, annotation); }}
						onClick={function(e) { that._onClickOnAnnotation(annotation); }}
						/>;
				})}
				{/* handles go last to make sure they're not hidden behind something else */}
				{selectedAnnotationSvgHandles}
			</svg>
		);
	}
});

//================================================================================

targetId = 'percept_annotation_sidebar_react_slot';
targetElem = document.getElementById(targetId);
if (targetElem) {
	React.renderComponent(<PerceptAnnotationSidebar />, targetElem);
}

var targetId = 'percept_annotation_svg_react_slot';
var targetElem = document.getElementById(targetId);
if (targetElem) {
	React.renderComponent(<PerceptAnnotationSvg />, targetElem);
}

})();
