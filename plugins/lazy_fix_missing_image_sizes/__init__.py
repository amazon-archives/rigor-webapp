import rigorwebapp.plugin
import numpy as np
import cv2

from flask import Response
from flask import jsonify

from rigor.config import RigorDefaultConfiguration
import rigor.types

from sqlalchemy import update

class LazyFixMissingImageSizesPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		self.thumbnail_size_max = int(config.get('webapp', 'thumbnail_size_max'))

	def add_routes(self, app, backend, plugin_instances):
		@app.route('/lazy_fix_missing_image_sizes/db/<db_name>/percept/<int:percept_id>')
		def lazy_fix_missing_image_sizes(db_name, percept_id):
			mimetype, data = backend.percept_data(db_name, percept_id)
			array = np.asarray(bytearray(data), dtype=np.uint8)
			image = cv2.imdecode(array, -1)
			size = (image.shape[1], image.shape[0])
			thumb_size = backend.percept_image_scaled_size(size, self.thumbnail_size_max)
			size_dict = {
				'width': size[0],
				'height': size[1],
				'thumb_width': thumb_size[0],
				'thumb_height': thumb_size[1],
			}
			with backend.dbs[db_name].get_session() as session:
				session.query(rigor.types.Percept).\
					filter_by(id=str(percept_id)).\
					update({
						'x_size': size_dict['width'], 
						'y_size': size_dict['height']
					})
			return jsonify(size_dict)

	def augment_template_slots(self, page_state, template_slots):
		if page_state['current_view'] in ('percept_search_page', 'percept_detail_page'):
			template_slots.append('js_tail_path', '/static/plugins/lazy_fix_missing_image_sizes/js/onload.js')
			template_slots.append('css_path', '/static/plugins/lazy_fix_missing_image_sizes/css/index.css')
