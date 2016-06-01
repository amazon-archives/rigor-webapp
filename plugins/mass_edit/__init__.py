import rigorwebapp.plugin

class MassEditPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		pass

	def add_routes(self, app, backend, plugin_instances):
		pass

	def augment_page_state(self, page_state):
		pass

	def augment_template_slots(self, page_state, template_slots):
		if page_state['current_view'] == 'percept_search_page':
			template_slots.append('sidebar', """
				<div class="sidebarTitle">
					Mass Edit
				</div>
				<input type="button" value="Select all" />
				<input type="button" value="Select none" />
				<div class="searchFormRow">
					<div class="searchFormRowLabel">
						Add tags to selected percepts
					</div>
					<input style="width:100%" type="text" />
				</div>
				<input type="button" value="Delete selected percepts" />
			""")
