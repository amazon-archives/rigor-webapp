import json
import rigorwebapp.plugin
from rigorwebapp.utils import debug_error

class PerceptAnnotationsPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		try:
			external_config_string = config.get('webapp', 'external_link_templates')
		except:
			external_config_string = '{}'

		try:
			self.external_link_templates = json.loads(external_config_string)
		except:
			debug_error('WARNING: could not parse JSON in config file for external_link_templates')
			self.external_link_templates = dict()

	def add_routes(self, app, backend, plugin_instances):
		pass

	def augment_page_state(self, page_state):
		page_state['percept_annotations'] = dict(external_link_templates=self.external_link_templates)

	def augment_template_slots(self, page_state, template_slots):
		if page_state['current_view'] == 'percept_detail_page':
			template_slots.append('js_head_path', '/static/js/vendor/react-0.12.2.min.js')
			template_slots.append('js_head_path', '/static/js/vendor/JSXTransformer.js')
			template_slots.append('js_head_path', '/static/plugins/percept_annotations/js/vendor/mousetrap.1.5.2.min.js')
			template_slots.append('css_path', '/static/plugins/percept_annotations/css/index.css')
			template_slots.append('js_tail_path', '/static/plugins/percept_annotations/js/index.js" type="text/jsx')
			percept = page_state['percept_detail_page']['percept']
			template_slots.append('main_panel', """
				<div id="percept_annotation_svg_react_slot" class="annotationSvgContainer">
				</div>
			""".format(percept['x_size'], percept['y_size']))
			template_slots.append('sidebar_top', """
				<div class="sidebarTitle">
					Annotations
				</div>
				<div id="percept_annotation_sidebar_react_slot">
				</div>
			""")
