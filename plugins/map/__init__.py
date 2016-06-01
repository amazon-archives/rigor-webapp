import rigorwebapp.plugin

class MapPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		pass

	def add_routes(self, app, backend, plugin_instances):
		pass

	def augment_page_state(self, page_state):
		pass

	def augment_template_slots(self, page_state, template_slots):
		template_slots.append('css_path', '/static/plugins/map/css/index.css')
		template_slots.append('sidebar', """
				<div class="sidebarTitle">
					Map
				</div>
				<div class="plugin_map_mock_map">
					<br/><br/>
					(map goes here)
				</div>
		""")
