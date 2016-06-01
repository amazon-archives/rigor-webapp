import os
import imp
import inspect

from rigorwebapp.utils import debug_error

class BasePlugin(object):
	def __init__(self, backend, rigor_config):
		"""Instantiates the plugin.
		"""
		pass
	def add_routes(self, app, backend, plugin_instances):
		"""Adds route handlers to the Flask app.
		app: a flask app
		backend: a rigorwebapp.backend instance
		plugin_instances: a list of all the plugin instances
		returns: None
		"""
		pass
	def augment_page_state(self, page_state):
		"""Adds content to the page_state dictionary.
		Mutates the dictionary and return None.
		"""
		pass
	def augment_template_slots(self, page_state, template_slots):
		"""Adds content to the template_slots object and returns None.
		"""
		pass

def get_plugin_paths(rigor_config):
	"""Processes the paths in rigor_config.plugin_paths and makes them absolute.
	"""
	# find the core plugins directory
	plugin_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../plugins'))
	if not os.path.exists(plugin_root):
		plugin_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../plugins'))
	if not os.path.exists(plugin_root):
		debug_error('ERROR: plugin root not found at {}'.format(plugin_root))
		return []

	# parse and absolutify the paths in the config file
	# TODO: allow paths outside the core plugins directory
	plugin_paths = rigor_config.get('webapp', 'plugin_paths').rstrip(" ,\t")
	plugin_paths = [path.strip() for path in plugin_paths.split(',')]
	return [os.path.join(plugin_root, plugin_path) for plugin_path in plugin_paths]

def load_plugin_instances(rigor_config, backend):
	"""Instantiates and returns an instance of each plugin class.
	First, dynamically imports the modules from the paths in rigor_config.plugin_paths.
	Inside each module, looks for subclasses of BasePlugin.
	Instantiates those classes and returns a list of the instances across all plugins.
	"""
	plugin_instances = []

	for plugin_path in get_plugin_paths(rigor_config):
		plugin_name = os.path.basename(plugin_path)
		module = imp.load_source(plugin_name, os.path.join(plugin_path, '__init__.py'))
		for val in module.__dict__.values():
			if inspect.isclass(val) and issubclass(val, BasePlugin):
				plugin_instances.append(val(backend, rigor_config))
	return plugin_instances

class TemplateSlots(object):
	"""For each pageload a single TemplateSlots instance is created.
	Each plugin then gets a chance to append things to slots.
	The page template then uses the content of the slots.
	"""
	def __init__(self):
		self._slots = dict()
	def append(self, slot, content):
		"""Appends the content to the given slot.
		slot: a string
		content: a string (html, path to css file, etc, depending on the slot)
		"""
		if not slot in self._slots:
			self._slots[slot] = []
		self._slots[slot].append(content)
	def get(self, slot):
		"""Returns a list of all the contents of the given slot.
		If a slot was never appended to and does not exist, return an empty list.
		"""
		return self._slots.get(slot, list())
	def get_unique(self, slot):
		"""Returns a list of all the contents of the given slot, with duplicates removed.
		If a slot was never appended to and does not exist, return an empty list.
		"""
		result = list()
		for item in self.get(slot):
			if not item in result:
				result.append(item)
		return result
	def __repr__(self):
		return repr(self._slots)

def augment_request(plugin_instances, page_state, template_slots):
	"""Runs the augment_page_state and augment_template_slots methods of the plugin instances.
	"""
	for plugin_instance in plugin_instances:
		plugin_instance.augment_page_state(page_state)
	for plugin_instance in plugin_instances:
		plugin_instance.augment_template_slots(page_state, template_slots)
