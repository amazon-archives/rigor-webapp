import rigorwebapp.plugin

class DocsPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		kConfigParam = ("webapp", "documentation_root")
		self.plugin_enabled = True
		if kConfigParam in config:
			self.documentation_root = config.get(kConfigParam[0], kConfigParam[1])
		else:
			self.plugin_enabled = False

	def add_routes(self, app, backend, plugin_instances):
		pass

	def augment_page_state(self, page_state):
		pass

	def augment_template_slots(self, page_state, template_slots):
		if self.plugin_enabled:
			template_slots.append('sidebar', """
					<div class="sidebarTitle">
						Documentation
					</div>
					<a href="{}" target="_new" title="Rigor Reference Docs">Rigor Reference</a>
			""".format(self.documentation_root))
