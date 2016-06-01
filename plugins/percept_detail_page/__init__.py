from __future__ import division
import json

from flask import request
from flask import Response
from flask import render_template
from flask import abort
import jinja2

import rigorwebapp.plugin
import rigorwebapp.utils
import rigorwebapp.auth

kPluginName = 'percept_detail_page'

AuthClient = rigorwebapp.auth.DefaultAuthClient()

class PerceptDetailPagePlugin(rigorwebapp.plugin.BasePlugin):
	def __init__(self, backend, rigor_config):
		self.rigor_config = rigor_config

	def add_routes(self, app, backend, plugin_instances):
		@app.route('/db/<db_name>/percept/<percept_id>')
		@AuthClient.check_access_and_inject_user(self.rigor_config)
		def percept_detail_page(db_name, percept_id, username=None):
			if not db_name in backend.db_names():
				abort(404)
			percept = backend.percept(db_name, percept_id)
			if percept is None:
				abort(404)
			page_state = {
				'current_view': kPluginName,
				'username': username,
				kPluginName: dict(
					db_name=db_name,
					percept=percept,
				),
			}
			template_slots = rigorwebapp.plugin.TemplateSlots()
			rigorwebapp.plugin.augment_request(plugin_instances, page_state, template_slots)
			return render_template('standard_template.html', page_state=page_state, template_slots=template_slots)

	def augment_page_state(self, page_state):
		pass

	def augment_template_slots(self, page_state, template_slots):
		if page_state['current_view'] != kPluginName:
			return

		db_name = page_state[kPluginName]['db_name']

		percept = page_state[kPluginName]['percept']
		for param in ('x_size','y_size'):
			if param not in percept:
				percept[param] = ''

		template_slots.append('main_panel', """
			<img class="percept" src="{}" width="{}" height="{}" alt="percept {}" />
		""".format(percept['img_url'], percept['x_size'], percept['y_size'], percept['id']))

		sidebar_template_context = dict(
			percept=percept,
			tag_to_hue=rigorwebapp.utils.hash_string_to_hue,
			timestamp_to_string=rigorwebapp.utils.unix_timestamp_to_string,
			db_name=db_name,
		)
		sidebar_template = """
			<div class="sidebarTitle">
				Percept Metadata
			</div>
			<div class="sidebarSection">
				<div class="sidebarSectionTitle">
					Metadata
				</div>
				<div class="sidebarSectionRow">
					<div class="sidebarSectionRowLabel">id</div>
					<div class="sidebarSectionRowValue"> {{percept.id}}</div>
				</div>
				<div class="sidebarSectionRow">
					<div class="sidebarSectionRowLabel">device id</div>
					<div class="sidebarSectionRowValue"> {{percept.device_id}}</div>
				</div>
				<div class="sidebarSectionRow">
					<div class="sidebarSectionRowLabel">pixel size</div>
					<div class="sidebarSectionRowValue"> {{percept.x_size}} &#215; {{percept.y_size}}</div>
				</div>
				<div class="sidebarSectionRow">
					<div class="sidebarSectionRowLabel">timestamp</div>
					<div class="sidebarSectionRowValue"> {{timestamp_to_string(percept.stamp, '%Y-%m-%d %H:%M:%S UTC')}}</div>
				</div>
				<div class="sidebarSectionRow">
					<div class="sidebarSectionRowLabel">hash</div>
					<div class="sidebarSectionRowValue"> {{percept.hash}}</div>
				</div>
				<div class="sidebarSectionRow">
					<div class="sidebarSectionRowLabel">locator</div>
					<div class="sidebarSectionRowValue"> <a href="/api/v1/db/{{db_name}}/percept/{{percept.id}}/data">{{percept.locator}}</a></div>
				</div>
			</div>
			{% if percept.collections %}
				<div class="sidebarSection">
					<div class="sidebarSectionTitle">
						Collections
					</div>
					{% for collection in percept.collections %}
						<div class="sidebarSectionRow">
							<div class="sidebarSectionRowLabel"><a href="/db/{{db_name}}/perceptsearch?collection_id={{collection.collection_id}}">{{collection.collection_id}}</a></div>
							<div class="sidebarSectionRowValue">{{collection.collection_n}}</div>
						</div>
					{% endfor %}
				</div>
			{% endif %}
			{% if percept.sensors %}
				<div class="sidebarSection">
					<div class="sidebarSectionTitle">
						Sensors
					</div>
					{% if percept.sensors.location %}
						<div class="sidebarSectionRow">
							<div class="sidebarSectionRowLabel">location</div>
							<div class="sidebarSectionRowValue"> {{percept.sensors.location[0]}}, {{percept.sensors.location[1]}}</div>
						</div>
					{% endif %}
					{% if percept.sensors.location_accuracy %}
						<div class="sidebarSectionRow">
							<div class="sidebarSectionRowLabel">loc accuracy</div>
							<div class="sidebarSectionRowValue"> {{percept.sensors.location_accuracy | round(2)}} m</div>
						</div>
					{% endif %}
					{% if percept.sensors.location_provider %}
						<div class="sidebarSectionRow">
							<div class="sidebarSectionRowLabel">provider</div>
							<div class="sidebarSectionRowValue"> {{percept.sensors.location_provider}}</div>
						</div>
					{% endif %}
					{% if percept.sensors.bearing %}
						<div class="sidebarSectionRow">
							<div class="sidebarSectionRowLabel">bearing</div>
							<div class="sidebarSectionRowValue"> {{percept.sensors.bearing | round(2)}}</div>
						</div>
					{% endif %}
					{% if percept.sensors.speed %}
						<div class="sidebarSectionRow">
							<div class="sidebarSectionRowLabel">speed</div>
							<div class="sidebarSectionRowValue"> {{percept.sensors.speed | round(2)}} m/s</div>
						</div>
					{% endif %}
				</div>
			{% endif %}
			<div class="sidebarSection">
				<div class="sidebarSectionTitle">
					Tags
				</div>
				<div class="sidebarSectionRow">
					{% for tag in percept.tags %}
						<div class="tag"
							style="background: hsl({{tag_to_hue(tag)}}, 25%, 50%)"
							>
							{{tag}}
						</div>
					{% endfor %}
				</div>
			</div>
			<div class="sidebarSection">
				<div class="sidebarSectionTitle">
					Properties
				</div>
				{% for (key, val) in percept.properties | dictsort %}
					<div class="sidebarSectionRow">
						<div class="sidebarSectionRowLabel">{{key}}</div>
						<div class="sidebarSectionRowValue"> <a href="/db/{{db_name}}/perceptsearch?percept_property={{key}}%3D{{val}}">{{val}}</a></div>
					</div>
				{% endfor %}
			</div>
			<div class="sidebarSection">
				<div class="sidebarSectionTitle">
					Direct Link
				</div>
				<div class="sidebarSectionRow">
					<div class="sidebarSectionRowLabel">{{percept.format}}</div>
					<div class="sidebarSectionRowValue"> <a href="/api/v1/db/{{db_name}}/percept/{{percept.id}}/data">Download</a></div>
				</div>
			</div>
		"""
		template_slots.append('sidebar', jinja2.Template(sidebar_template).render(sidebar_template_context))
