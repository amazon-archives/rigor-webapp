import rigorwebapp.plugin

class ExamplePlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		pass

	def add_routes(self, app, backend, plugin_instances):
		@app.route('/plugin/example')
		def example_route():
			return 'This is a page created by the example plugin.'

	def augment_page_state(self, page_state):
		pass

	def augment_template_slots(self, page_state, template_slots):
		if page_state['current_view'] == 'percept_search_page':
			template_slots.append('sidebar', """
				<div class="sidebarTitle">
					Example Plugin
				</div>
				This plugin has its own CSS file which makes <span class="plugin_example_css_demo">this text red</span>.
				<br/>
				Using javascript, we can show that this search returned <span id="plugin_example_num_search_results">?</span> percepts.
				<br/>
				This plugin also is serving <a href="/plugin/example">its own page.</a>
			""")
			template_slots.append('sidebar', """
				<div class="sidebarTitle">
					Example Plugin Part 2
				</div>
				One plugin can create multiple sidebar boxes.
			""")
		elif page_state['current_view'] == 'percept_detail_page':
			template_slots.append('sidebar', """
				<div class="sidebarTitle">
					Example Plugin
				</div>
				This is a sidebar box on the percept page.
			""")
		else:
			return # don't include plugin on any other pages

		template_slots.append('css_path', '/static/plugins/example/css/index.css')
		template_slots.append('js_head_path', '/static/plugins/example/js/index_head.js')
		template_slots.append('js_tail_path', '/static/plugins/example/js/index_tail.js')
