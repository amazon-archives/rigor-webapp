import time
import calendar
import cPickle as pickle

from flask import request
from flask import Response
from flask import jsonify

import rigorwebapp.plugin
import rigorwebapp.cache

from rigor.config import RigorDefaultConfiguration

kExpires = 'Expires'

class ApiPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, rigor_config):
		self.cache = rigorwebapp.cache.DefaultCacheClient()
		self.max_image_size = int(rigor_config.get('webapp', 'max_size_for_caching_images'))
		self.cache_seconds = int(rigor_config.get('webapp', 'thumbnail_cache_seconds'))
		try:
			self.site_name = rigor_config.get('webapp', 'site_name')
		except:
			self.site_name = 'Rigor'

	def add_routes(self, app, backend, plugin_instances):
		def _create_cache_key(request_path, max_size):
			'''
			Given the Flask request, creates a key to be used for caching
			'''
			return request_path + '?max_size=' + str(max_size) 

		def _set_expire(seconds=0):
			'''
			Creates a time object N seconds from now
			'''
			now = calendar.timegm(time.gmtime());
			then = now + seconds
			return time.strftime("%a, %d %b %Y %H:%M:%S", time.gmtime(then))

		@app.route('/api/v1/db/<db_name>/percept/<int:percept_id>/data')
		def percept_data(db_name, percept_id):
			max_size = request.args.get('max_size', None)
			data = None
			mimetype = None
			if isinstance(max_size, str) or isinstance(max_size, unicode):
				max_size = int(max_size)
			if max_size:
				cache_key = _create_cache_key(request.path, max_size)
				cache_value = self.cache.get(cache_key)
				if cache_value is None:
					try:
						mimetype, data = backend.percept_image_scaled(db_name, percept_id, max_size)
					except:
						# backend failed to fetch percept data.  missing images?
						return "Could not fetch image data", 404
					if max_size < self.max_image_size:
						cache_value = pickle.dumps((mimetype, data))
						self.cache.set(cache_key, cache_value)
				else:
					mimetype, data = pickle.loads(self.cache.get(cache_key))
			else:
				try:
					mimetype, data = backend.percept_data(db_name, percept_id)
				except:
					# backend failed to fetch percept data.  missing images?
					return "Could not fetch image data", 404
			expire_time = _set_expire(seconds=self.cache_seconds)
			headers = {kExpires: expire_time}
			return Response(data, mimetype=mimetype, headers=headers)

		@app.route('/api/v1/db/<db_name>/batch', methods=['POST'])
		def batch(db_name):
			"""Make multiple changes to the database.
			TODO: define this in more detail once individual change endpoints are written.
			"""
			changes = request.get_json()
			print(changes) # TODO: apply changes to the db
			return jsonify({'success': True})

		@app.route('/api/v1/db/<db_name>/percept/<int:percept_id>/field/<field>', methods=['POST'])
		def set_percept_field(db_name, percept_id, field):
			value = request.get_json()
			backend.set_percept_field(db_name, percept_id, field, value)
			return jsonify({'success': True})

		@app.route('/api/v1/db/<db_name>/annotation/<int:annotation_id>/field/<field>', methods=['POST'])
		def set_annotation_field(db_name, annotation_id, field):
			value = request.get_json()
			backend.set_annotation_field(db_name, annotation_id, field, value)
			return jsonify({'success': True})

		@app.route('/api/v1/db/<db_name>/annotation/<int:annotation_id>', methods=['DELETE'])
		def delete_annotation(db_name, annotation_id):
			backend.delete_annotation(db_name, annotation_id)
			return jsonify({'success': True})

		@app.route('/api/v1/db/<db_name>/annotation', methods=['POST'])
		def create_annotation(db_name):
			annotation = request.get_json()
			newId = backend.create_annotation(db_name, annotation)
			return jsonify({'success': True, 'new_id': newId})

	def augment_template_slots(self, page_state, template_slots):
		template_slots.append('js_head_path', '/static/plugins/api/js/index.js')
		# inject site_name so the standard template can display it
		page_state['site_name'] = self.site_name
		if page_state['current_view'] == 'percept_detail_page':
			template_slots.append('css_path', '/static/plugins/api/css/index.css')
			template_slots.append('js_tail_path', '/static/plugins/api/js/button.js')
			template_slots.append('sidebar_top', """
				<div class="centeredText apiIndicatorSaved" id="api_save_button">
					Saved
				</div>
			""")
