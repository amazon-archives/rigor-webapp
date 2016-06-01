#!/usr/bin/env python

import os
import sys
import argparse

import rigorwebapp.app
import rigorwebapp.plugin
from rigorwebapp.utils import debug_detail, debug_main, debug_error

import rigor.config

def rebuild_plugin_static_symlinks(plugin_paths):
	"""Delete and recreate symlinks from the main static/ directory to plugins' static directories.
	"""
	# find share/static/plugins
	here = os.path.dirname(os.path.abspath(__file__))
	static_plugins = os.path.abspath(os.path.join(here, '../share/static/plugins'))
	if not os.path.exists(static_plugins):
		debug_error("can't find main static plugins directory (expected at {})".format(static_plugins))
		sys.exit(1)
	debug_detail('    {}'.format(static_plugins))

	# remove existing links
	for rel_fn in os.listdir(static_plugins):
		abs_fn = os.path.join(static_plugins, rel_fn)
		if os.path.islink(abs_fn):
			os.unlink(abs_fn)

	# add fresh links
	for plugin_path in plugin_paths:
		plugin_static = os.path.join(plugin_path, 'static')
		plugin_name = os.path.basename(plugin_path)
		if os.path.exists(plugin_static):
			debug_detail('      {} -> {}'.format(plugin_name, plugin_static))
			os.symlink(plugin_static, os.path.join(static_plugins, plugin_name))

if __name__ == '__main__':
	# handle command line
	parser = argparse.ArgumentParser(description='Start a Flask dev server for Rigor Hub.')
	parser.add_argument('-p', '--port', type=int, default=8000)
	parser.add_argument('-c', '--config', type=str, default='~/.rigor.ini', help='Path to .rigor.ini config file')
	args = parser.parse_args()

	rigor_config = rigor.config.RigorDefaultConfiguration(args.config)

	debug_main('--------------------------------------------------------------------------------')
	debug_main('rebuilding plugin symlinks in main static directory')
	rebuild_plugin_static_symlinks(rigorwebapp.plugin.get_plugin_paths(rigor_config))

	debug_main('building and running flask app')
	app = rigorwebapp.app.get_app(rigor_config)
	app.run(debug=True, port=args.port, host='0.0.0.0', use_evalex=False, threaded=True)
