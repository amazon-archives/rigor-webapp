from __future__ import division
import pprint
import time
import json

import rigorwebapp.plugin
import rigorwebapp.auth

import rigor.types

from flask import render_template
from flask import abort
from flask import request
from flask import jsonify

import jinja2

from sqlalchemy import and_
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import text

kPluginName = 'catapult'
kDefaultNumPercepts = 10
kMaxNumPercepts = 100
kAllCategories = """
	apple
	banana
	cherry
	daikon
"""
kAllCategories = [cat.strip() for cat in kAllCategories.splitlines() if cat.strip()]

# a list of descriptions of what should not be included in each category.
# format:
#   CAT_NAME: DESCRIPTION
kCategoriesDoNotInclude = """
	apple: Apple Computer products
	banana: drawings of bananas
	cherry: drawings of cherries
	daikon: radishes
"""
kCategoriesDoNotInclude = [cat.strip() for cat in kCategoriesDoNotInclude.splitlines() if cat.strip()]
kCategoriesDoNotInclude = dict(line.split(': ', 1) for line in kCategoriesDoNotInclude)

AuthClient = rigorwebapp.auth.DefaultAuthClient()

class DebugTimer(object):
	def __init__(self, name=''):
		self.start = time.time()
		self.name = name
		self.last_tick = self.start
	def tick(self, desc=''):
		now = time.time()
		print('{} - {:6.3f} sec - {}'.format(self.name, now - self.last_tick, desc))
		self.last_tick = now
	def end(self):
		print('{} - {:6.3f} sec total'.format(self.name, time.time() - self.start))

#================================================================================
# HELPERS

def find_percepts_to_label(backend, db_name, limit=10):
	"""Return a list of percept dicts which need to be labeled.
	These dicts only contain {id: 123}.
	They are randomly selected from the unlabeled percepts.
	"""
	timer = DebugTimer('~~~~	finding percepts to label')
	backend._ensure_db_exists(db_name)
	timer.tick('ensured db exists')
	percepts = []
	with backend.dbs[db_name].get_session(commit=False) as session:
		timer.tick('got session')
		raw_sql = """
			SELECT percept.id
			FROM percept
			WHERE NOT EXISTS (
				SELECT * FROM annotation
				WHERE annotation.domain = 'category'
				AND annotation.percept_id = percept.id
			)
			ORDER BY random()
			LIMIT :limit;
		"""
		col_names = 'id'.split()
		params = dict(limit=limit)
		rows = session.execute(text(raw_sql), params=params)
		timer.tick('executed sql')
		percept_group = dict()
		this_percept_id = None
		for row in rows:
			rowdict = dict(zip(col_names, row))
			percepts.append(rowdict)
		timer.tick('enumerated {} rows'.format(len(percepts)))
	timer.tick('closed session')
	timer.end()
	return percepts

#================================================================================

class CatapultPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		self.rigor_config = config

	def add_routes(self, app, backend, plugin_instances):
		@app.route('/db/<db_name>/catapult')
		@AuthClient.check_access_and_inject_user(self.rigor_config)
		def catapult_main_page(db_name, username=None):
			if not db_name in backend.db_names():
				abort(404)

			page_state = {
				'current_view': kPluginName,
				'username': username,
				kPluginName: dict(
					db_name=db_name,
					db_names=backend.db_names(),
					all_categories=kAllCategories,
					categories_do_not_include=kCategoriesDoNotInclude,
				)
			}
			template_slots = rigorwebapp.plugin.TemplateSlots()
			rigorwebapp.plugin.augment_request(plugin_instances, page_state, template_slots)
			return render_template('minimal_template.html', page_state=page_state, template_slots=template_slots)

		@app.route('/db/<db_name>/catapult/api/percepts_to_label')
		@AuthClient.check_access_and_inject_user(self.rigor_config)
		def percepts_to_label(db_name, username=None):
			n = request.args.get('n', kDefaultNumPercepts)
			try:
				n = int(n)
			except ValueError:
				n = kDefaultNumPercepts
			n = max(1, min(kMaxNumPercepts, n))
			if not db_name in backend.db_names():
				abort(404)
			percepts = find_percepts_to_label(backend, db_name, limit=n)
			return jsonify({'success': True, 'percepts': percepts})

	def augment_page_state(self, page_state):
		pass

	def augment_template_slots(self, page_state, template_slots):
		# add to navbar on all pages
		# first, figure out db_name
		try:
			db_name = page_state[page_state['current_view']]['db_name']
		except KeyError:
			try:
				db_name = self.rigor_config.get("webapp", "initial_db")
			except rigor.config.NoValueError:
				db_name='?'
		navbar_url = '/db/{}/catapult'.format(db_name)
		template_slots.append('navbar_link', '<a href="{}">Catapult</a>'.format(navbar_url))

		if page_state['current_view'] == kPluginName:
			template_slots.append('body', """
				<div id="catapult-react-slot" />
			""")

			# javascript to render the main interface
			template_slots.append('js_head_path', '/static/js/vendor/react-0.12.2.js')
			template_slots.append('js_head_path', '/static/js/vendor/JSXTransformer.js')
			template_slots.append('js_head_path', '/static/plugins/catapult/js/vendor/mousetrap.1.5.2.min.js')
			template_slots.append('css_path', '/static/plugins/catapult/css/index.css')
			template_slots.append('js_tail_path', '/static/plugins/catapult/js/index.js" type="text/jsx')
