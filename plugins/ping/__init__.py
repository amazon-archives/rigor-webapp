import rigorwebapp.plugin

class PingPlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, config):
		pass

	def add_routes(self, app, backend, plugin_instances):
		@app.route('/ping')
		def ping():
			return 'OK'

		@app.route('/sping')
		def sping():
			return 'OK'
