**This repository is no longer being updated.** New development is happening in [rigorgt/rigor-webapp](https://github.com/rigorgt/rigor-webapp).

Rigor Hub
======================

A web app for searching and editing the contents of Rigor databases.

Important files:

    bin/run.py                   # Start the flask app
    rigorwebapp/*.py             # Python source code
    js/*                         # Source and build machinery for rigorhub.js
    plugins/*                    # Plugins, each in its own directory.  They can also be elsewhere.
    share/static/*               # CSS, images, Javascript
    share/static/js/rigorhub.js  # Provides the Rigor Hub API to plugin js scripts
    share/templates/*.html       # Flask templates

Configuration
----------------------

Configuration is stored in `rigorwebapp/config.py`.

Set `kDbHost`, `kDbUser`, and `kDbPassword` to match your Rigor database.

Set `kInitialDbName` to the default database to show on first load.

Change `kFlaskSecretKey` to a large random string.  Flask uses it to cryptographically sign cookies.

Plugins are not auto-discovered.  To add a plugin, add its path to the `kPluginPaths` list.

Plugins
----------------------

Plugins work in three ways:

* They can add new routes to the app to create new pages or REST API methods.
* For each request, they can add chunks of HTML to various parts of the page (on the server side) to add sidebar boxes, script tags, css links, etc.
* They can add their own js scripts to the page that provide client-side functionality.

Each plugin lives in its own directory which should be structured as a python module with an `__init__.py` file.  Plugins should export two functions:

    def on_boot(app, backend)  # add routes to the Flask app object
    def on_request(pageState, template_slots)  # add chunks of content to the page which is being rendered

Each plugin can also have a `static` directory for CSS and Javascript files which will be symlinked into the main share directory and served over HTTP as `/share/static/plugins/PLUGIN_NAME/`.

Plugin js scripts can access the main rigorhub API object to get information about the page contents and to use REST API helper methods:

    // example plugin javascript

    // fetch the rigorhub module
    var rigorhub = require('/rigorhub.js');

    // read from the pageState object
    var perceptTags = rigorhub.pageState.get('percept.tags');

    // watch for changes to pageState
    rigorhub.pageState.onChange('percept.tags', function(newVal, oldVal) {
        console.log('The tags were changed to ' + newVal);
    });

    // use REST API helper methods
    rigorhub.api.addTagToPercept(/* etc */);

In the browser, `lodash` (a replacement for Underscore, the utility library) is already loaded as `window._` in the usual way.  Plugins can request additional javascript libraries from within their python onRequest functions.

Building rigorhub.js
----------------------

A built version of rigorhub.js is already included so this step is only necessary if you're editing the core js files.

    $ cd js
    $ npm install  # download js dependencies, run browserify, and write to js/dist/rigorhub.js
    $ npm test  # run tests
    $ npm copy-to-static  # copy the bundled rigorhub.js to share/static/js/rigorhub.js

Running the Flask app
----------------------

Start a development Flask server:

    $ bin/run.py PORTNUMBER

Don't use Flask's development server in production!  Use a dedicated WSGI server like uWSGI.

Template Slots
----------------------

Each plugin can supply its own template, but these are the standard template slots.

	css_path  # http path to css file
	js_head_path  # http path to js file, included in the document head
	js_tail_path  # http path to js file, included at the end of the document body

	main_panel  # the main section of the interface

	sidebar_pager_bar  # nav links.  should be a pager-bar dict (see below)
	main_panel_pager_bar  # nav links.  should be a pager-bar dict (see below)

	sidebar_top  # html contents of a sidebar box at the top of the sidebar
	sidebar  # html contents of a sidebar box in the middle of the sidebar
	sidebar_bottom  # html contents of a sidebar box at the bottom of the sidebar

	toolbar_left  # html to make a button on the toolbar (left side)
	toolbar_right  # html to make a button on the toolbar (right side)

A pager bar dict should have some of these properties:

	up_label  # text for the navigate-upwards button
	up_link
	prev_link
	next_link
	num_results  # number of results

Page State Data
----------------------

This is known as `page_state` in Python and `pageState` in Javascript, following the Python and Javascript style guides.

`page_state` is a large nested dict containing data about the currently viewed page.  It's built on the server side.  On the Javascript side, scripts can read and write to it and subscribe to changes in any particular piece of it.

The root level of the dict consists of plugin names.  Each plugin keeps its own data in its own section.

There's also a special value `current_view` which contains the name of the plugin which generated the main page HTML.

Plugin names and their data:

	percept_search
		db_name      # name of the currently viewed database
		db_names     # sorted list of all database names
		search_results   # a list of percept dicts
	
	percept_detail
		db_name      # name of the currently viewed database
		percept      # a single percept dict

Example `page_state`:

	{
		current_view: "percept_detail",
		percept_detail: {
			db_name: "kittens",
			percept: { ... a percept dict ... },
		},
		percept_detail_kittendb_data: {
			// This hypothetical plugin looks up related details from an external database.
			// They are added to the page_state on the server side
			// and used in some way by javascript on the page.
			kitten_name: "sylvester",
			kitten_owner: "granny smith",
		}
	}

Example Javascript to read annotations from page_state when they change:

	var rigorhub = require('/rigorhub.js');
	rigorhub.pageState.onChange('percept_detail.percept.annotations', function(newVal) {
		// Someone changed the annotations in the current browser session
		// (probably using a plugin for annotation editing).
		// We can update some external database with the changes here
	});

Example percept dict:

	{
		// all values can be null unless otherwise marked
		annotations: [list of annotations],
		collections: [list of collections],
		device_id: string,
		format: string,  // not null
		hash: string,
		id: int,  // not null
		locator: string,  // not null
		properties: {dict string->string},
		sample_count: int,
		sample_rate: int,
		stamp: unix timestamp in seconds as a float,
		tags: [list of strings],
		x_size: int,
		y_size: int,
	}



