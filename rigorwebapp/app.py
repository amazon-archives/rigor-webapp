from __future__ import division
import os
import time

import functools

from flask import Flask
from flask import request
from flask import Response
from flask import redirect

import rigorwebapp.plugin
import rigorwebapp.backend
from rigorwebapp.utils import debug_detail, debug_error

def get_app(rigor_config):
	"""Builds and returns a Flask app object which gets its configuration from the given config file.
	rigor_config is an instance of rigor.config.RigorDefaultConfiguration(path_to_config_file)
	"""

	#================================================================================
	# FLASK HELPERS

	def check_auth(username, password):
		"""This function is called to check if a username /
		password combination is valid.
		"""
		return username == rigor_config.get('webapp', 'http_auth_user') and password == rigor_config.get('webapp', 'http_auth_password')

	def authenticate():
		"""Sends a 401 response that enables basic auth"""
		return Response(
			'Could not verify your access level for that URL.\n'
			'You have to login with proper credentials', 401,
			{'WWW-Authenticate': 'Basic realm="Login Required"'}
		)

	def use_basic_auth(fn):
		@functools.wraps(fn)
		def decorated(*args, **kwargs):
			if rigor_config.get('webapp', 'use_http_auth'):
				auth = request.authorization
				if not auth or not check_auth(auth.username, auth.password):
					return authenticate()
			return fn(*args, **kwargs)
		return decorated

	def simulate_slow(fn):
		@functools.wraps(fn)
		def decorated(*args, **kwargs):
			latency = int(rigor_config.get('webapp', 'fake_latency'))
			if latency > 0:
				debug_detail('adding {} seconds of fake delay'.format(latency))
				time.sleep(latency)
			return fn(*args, **kwargs)
		return decorated

	#================================================================================
	# FLASK SETUP

	share_folder = None
	share_folder_locations = ['../../share', '../../../../share', '../share']
	for path in share_folder_locations:
		path = os.path.abspath(os.path.join(os.path.dirname(__file__), path))
		if os.path.exists(path):
			share_folder = os.path.abspath(path)
			break
	if share_folder is None:
		debug_error('ERROR: Share folder not found')
		raise IOError('Share folder not found')
	else:
		debug_detail('found share folder at {}'.format(share_folder))

	app = Flask(
		__name__,
		static_folder=share_folder + '/static',
		template_folder=share_folder + '/templates',
	)
	app.config['SECRET_KEY'] = rigor_config.get('webapp', 'flask_secret_key')

	#================================================================================
	# PLUGINS

	debug_detail('loading backend')
	backend = rigorwebapp.backend.Backend(rigor_config)

	plugin_instances = rigorwebapp.plugin.load_plugin_instances(rigor_config, backend)
	debug_detail('loaded plugin classes:')
	for plugin_instance in plugin_instances:
		debug_detail('    {}'.format(plugin_instance.__class__.__name__))

	#================================================================================
	# ROUTING

	# let plugins add routes
	debug_detail('adding plugin routes')
	for plugin_instance in plugin_instances:
		plugin_instance.add_routes(app, backend, plugin_instances)

	@app.route('/')
	def index_redirect():
		initial_db = rigor_config.get('webapp', 'initial_db')
		initial_db = backend._encode_name_for_db(initial_db)
		return redirect('/db/{}/perceptsearch'.format(initial_db))

	app.config['PROPAGATE_EXCEPTIONS'] = True
	debug_detail('ready')

	# set up logging for sqlalchemy
	from logging import getLogger
	from logging import StreamHandler
	getLogger('sqlalchemy').addHandler(StreamHandler())

	return app
